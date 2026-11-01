"use server";
import { randomBytes, createHash } from "node:crypto";
import { appUrl } from "@/lib/config";
import { revalidatePath } from "next/cache";
import { tenant, uuid } from "@/domains/tenants/access";
import { serviceDb } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/config";
import { redactContacts } from "./inference";
import { settingsSchema } from "./schema";
import { normalizeImage } from "@/domains/catalog/images";
import { groundedReply } from "./grounding";
import { OpenAICompatibleAdapter, visualSearchPolicy } from "./provider";
import type { Product } from "@/domains/catalog/schema";
export async function saveSettings(input: unknown) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: "Réglages invalides : vérifiez les champs et leurs longueurs.",
    };
  const { error } = await client
    .from("ai_settings")
    .update(parsed.data)
    .eq("organization_id", organization.id);
  if (error) return { error: "Réglages non sauvegardés." };
  revalidatePath("/app/assistant");
  return { ok: true };
}
export async function simulate(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin", "agent"]);
  if (!aiConfigured())
    return {
      error:
        "Modèle non configuré. Ajoutez les variables IA et la clé serveur Supabase dans l’environnement sécurisé.",
    };
  const text = String(form.get("message") || "").trim();
  const image = form.get("image");
  const file = image instanceof File && image.size > 0 ? image : undefined;
  if ((!text && !file) || text.length > 3000)
    return {
      error: "Ajoutez un message de 3 000 caractères maximum ou une image.",
    };
  const { data: settingsRow, error: settingsError } = await client
    .from("ai_settings")
    .select("*")
    .eq("organization_id", organization.id)
    .single();
  if (settingsError) return { error: "Réglages de l’assistant indisponibles." };
  const settings = settingsSchema.parse(settingsRow);
  if (settings.paused)
    return {
      error: "L’assistant est en pause. Un administrateur peut le réactiver.",
    };
  let imageDataUrl: string | undefined;
  try {
    if (file)
      imageDataUrl = `data:image/webp;base64,${(await normalizeImage(file)).toString("base64")}`;
  } catch {
    return {
      error:
        "Image invalide : JPEG, PNG ou WebP, 5 Mo et 20 mégapixels maximum.",
    };
  }
  const admin = serviceDb();
  let conversationId: string | undefined;
  const requested = form.get("conversation_id");
  if (requested) {
    const parsed = uuid.safeParse(requested);
    if (!parsed.success) return { error: "Conversation invalide." };
    const { data } = await client
      .from("conversations")
      .select("id")
      .eq("id", parsed.data)
      .eq("organization_id", organization.id)
      .eq("is_simulation", true)
      .single();
    if (!data) return { error: "Conversation inaccessible." };
    conversationId = data.id;
  }
  const { data: event, error: quotaError } = await client.rpc(
    "reserve_ai_usage",
    { org: organization.id },
  );
  if (quotaError)
    return {
      error:
        "Essai expiré, quota quotidien atteint ou accès insuffisant. Consultez l’utilisation de votre boutique.",
    };
  try {
    if (!conversationId) {
      const { data, error } = await admin
        .from("conversations")
        .insert({
          organization_id: organization.id,
          is_simulation: true,
          source: "simulation",
        })
        .select("id")
        .single();
      if (error) throw error;
      conversationId = data.id;
    }
    const { data: history, error: historyError } = await client
      .from("messages")
      .select("role,content")
      .eq("organization_id", organization.id)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (historyError) throw historyError;
    const { data: rows, error } = await client
      .from("products")
      .select("*,product_variants(*),product_images(*)")
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(visualSearchPolicy.maxCatalogProducts);
    if (error) throw error;
    const products = (rows || []) as Product[];
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const ranked = [...products].sort((a, b) => {
      const score = (p: Product) =>
        words.filter((w) =>
          `${p.name} ${p.category} ${p.visual_attributes} ${p.tags.join(" ")}`
            .toLowerCase()
            .includes(w),
        ).length;
      return score(b) - score(a);
    });
    const catalogImages: { productId: string; url: string }[] = [];
    if (file)
      for (const p of ranked) {
        if (catalogImages.length >= visualSearchPolicy.maxImageCandidates)
          break;
        const first = p.product_images[0];
        if (first) {
          const { data } = await client.storage
            .from("catalog")
            .createSignedUrl(first.path, 120);
          if (data)
            catalogImages.push({ productId: p.id, url: data.signedUrl });
        }
      }
    const { error: messageError } = await admin.from("messages").insert({
      organization_id: organization.id,
      conversation_id: conversationId,
      role: "user",
      content:
        text +
        (file
          ? "\n[Image jointe · analysée sans conservation du fichier]"
          : ""),
    });
    if (messageError) throw messageError;
    const result = await new OpenAICompatibleAdapter().interpret({
      message: redactContacts(text),
      history: (history || [])
        .reverse()
        .map((m) => ({ role: m.role, content: redactContacts(m.content) })),
      products,
      settings,
      imageDataUrl,
      catalogImages,
    });
    // Refresh catalog facts after inference so a stock/price edit during the call is reflected.
    const selectedIds = result.selection.product_ids;
    const { data: fresh, error: freshError } = selectedIds.length
      ? await client
          .from("products")
          .select("*,product_variants(*),product_images(*)")
          .eq("organization_id", organization.id)
          .eq("status", "active")
          .in("id", selectedIds)
      : { data: [], error: null };
    if (freshError) throw freshError;
    const reply = groundedReply(
      result.selection,
      (fresh || []) as Product[],
      settings,
      Boolean(file),
    );
    if (result.selection.intent === "purchase") {
      const products = (fresh || []) as Product[];
      const variant = result.selection.variant_id
        ? products
            .flatMap((p) => p.product_variants)
            .find((v) => v.id === result.selection.variant_id)
        : products.length === 1 && products[0].product_variants.length === 1
          ? products[0].product_variants[0]
          : undefined;
      if (settings.checkout_enabled && !reply.needsHuman && variant?.id) {
        const token = randomBytes(32).toString("base64url");
        const { error } = await admin.rpc("create_ai_checkout", {
          _org: organization.id,
          _conversation: conversationId,
          _variant: variant.id,
          _quantity: result.selection.quantity,
          _hash: createHash("sha256").update(token).digest("hex"),
        });
        if (!error)
          reply.content +=
            "\n\n" +
            (reply.language === "fr"
              ? "Récapitulatif privé à confirmer (simulation) :"
              : reply.language === "ar"
                ? "رابط خاص لتأكيد المحاكاة:"
                : "رابط خاص لتأكيد التجربة:") +
            "\n" +
            appUrl() +
            "/commande/" +
            token;
        else reply.needsHuman = true;
      } else reply.needsHuman = true;
    }
    const { data: currentSettings } = await client
      .from("ai_settings")
      .select("paused")
      .eq("organization_id", organization.id)
      .single();
    if (!currentSettings || currentSettings.paused)
      throw new Error("Assistant mis en pause");
    const { error: replyError } = await admin.from("messages").insert({
      organization_id: organization.id,
      conversation_id: conversationId,
      role: "assistant",
      content: reply.content,
    });
    if (replyError) throw replyError;
    const { error: usageError } = await admin
      .from("usage_events")
      .update({
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        status: "completed",
      })
      .eq("id", event)
      .eq("organization_id", organization.id);
    if (usageError) throw usageError;
    await admin.from("ai_suggestions").insert({
      organization_id: organization.id,
      conversation_id: conversationId,
      content: reply.content,
      product_ids: reply.productIds,
      needs_human: reply.needsHuman,
      status: "approved",
    });
    revalidatePath("/app/assistant");
    return {
      conversationId,
      reply: reply.content,
      language: reply.language,
      needsHuman: reply.needsHuman,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  } catch {
    await admin
      .from("usage_events")
      .update({ status: "failed" })
      .eq("id", event)
      .eq("organization_id", organization.id);
    return {
      error:
        "Analyse interrompue ou fournisseur indisponible. Aucun message réel n’a été envoyé. Cette tentative reste comptée pour limiter les coûts.",
      conversationId,
    };
  }
}
