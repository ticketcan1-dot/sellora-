import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { settingsSchema, type AiSettings } from "./schema";
import { OpenAICompatibleAdapter } from "./provider";
import { groundedReply } from "./grounding";
import type { Product } from "@/domains/catalog/schema";
export function catalogFingerprint(products: Product[]) {
  const value = products
    .map((p) => ({
      id: p.id,
      status: p.status,
      variants: p.product_variants
        .map((v) => ({ id: v.id, price: v.price_minor, stock: v.stock }))
        .sort((a, b) => (a.id || "").localeCompare(b.id || "")),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function suggestionFingerprint(
  products: Product[],
  settings: AiSettings,
) {
  return createHash("sha256")
    .update(catalogFingerprint(products) + "|" + JSON.stringify(settings))
    .digest("hex");
}
export function redactContacts(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email masqué]")
    .replace(/(?:\+?\d[\s().-]*){7,}/g, "[téléphone masqué]")
    .replace(/(?:adresse|address|العنوان)\s*[:：].*/gi, "[adresse masquée]");
}
export async function inferForConversation(
  client: SupabaseClient,
  org: string,
  conversation: string,
  text: string,
  imageDataUrl?: string,
  assetId?: string,
) {
  const [
    { data: settings, error: se },
    { data: rows, error: pe },
    { data: messages, error: me },
  ] = await Promise.all([
    client.from("ai_settings").select("*").eq("organization_id", org).single(),
    client
      .from("products")
      .select("*,product_variants(*),product_images(*)")
      .eq("organization_id", org)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("messages")
      .select("role,content")
      .eq("organization_id", org)
      .eq("conversation_id", conversation)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  if (se || pe || me) throw new Error("Context unavailable");
  const config = settingsSchema.parse(settings);
  if (config.paused) throw new Error("Assistant paused");
  let products = rows as Product[];
  let linked: string[] = [];
  if (assetId) {
    const { data, error } = await client
      .from("social_media_assets")
      .select("product_id")
      .eq("organization_id", org)
      .eq("provider", "instagram")
      .eq("external_id", assetId);
    if (error) throw new Error("Asset context unavailable");
    linked = (data || []).map((a) => a.product_id);
    if (linked.length) {
      const { data, error } = await client
        .from("products")
        .select("*,product_variants(*),product_images(*)")
        .eq("organization_id", org)
        .eq("status", "active")
        .in("id", linked);
      if (error) throw new Error("Linked catalog unavailable");
      products = data as Product[];
    }
  }
  const catalogImages: { productId: string; url: string }[] = [];
  if (imageDataUrl)
    for (const p of products) {
      if (catalogImages.length >= 12) break;
      if (p.product_images[0]) {
        const { data } = await client.storage
          .from("catalog")
          .createSignedUrl(p.product_images[0].path, 120);
        if (data) catalogImages.push({ productId: p.id, url: data.signedUrl });
      }
    }
  const result = await new OpenAICompatibleAdapter().interpret({
    message: redactContacts(text),
    history: (messages || [])
      .reverse()
      .map((m) => ({ role: m.role, content: redactContacts(m.content) })),
    products,
    settings: config,
    imageDataUrl,
    catalogImages,
  });
  if (linked.length)
    result.selection = {
      ...result.selection,
      intent: "product",
      product_ids: linked.slice(0, 3),
      ambiguous: linked.length !== 1,
    };
  const selected = result.selection.product_ids;
  const { data: fresh, error } = selected.length
    ? await client
        .from("products")
        .select("*,product_variants(*),product_images(*)")
        .eq("organization_id", org)
        .eq("status", "active")
        .in("id", selected)
    : { data: [], error: null };
  if (error) throw new Error("Catalog verification unavailable");
  const current = fresh as Product[];
  const reply = groundedReply(
    result.selection,
    current,
    config,
    Boolean(imageDataUrl),
  );
  if (
    result.selection.variant_id &&
    !current.some((p) =>
      p.product_variants.some((v) => v.id === result.selection.variant_id),
    )
  )
    reply.needsHuman = true;
  return {
    ...reply,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    fingerprint: suggestionFingerprint(current, config),
    purchase: result.selection.intent === "purchase",
    quantity: result.selection.quantity,
    variantId:
      result.selection.variant_id &&
      current.some((p) =>
        p.product_variants.some((v) => v.id === result.selection.variant_id),
      )
        ? result.selection.variant_id
        : current.length === 1 && current[0].product_variants.length === 1
          ? current[0].product_variants[0].id
          : undefined,
  };
}
