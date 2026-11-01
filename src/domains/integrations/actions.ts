"use server";
import { z } from "zod";
import { tenant } from "@/domains/tenants/access";
import { serviceDb } from "@/lib/supabase/server";
import {
  createOAuthState,
  consumeOAuthState,
  connectWhatsApp,
} from "./connect";
import { graphVersion, metaReady, graphRequest } from "./meta-api";
import { decryptToken } from "./security";
import { finish, dbMessage } from "@/lib/forms";
export async function startWhatsApp() {
  const { organization, user } = await tenant(["owner", "admin"]);
  if (!metaReady("whatsapp"))
    return {
      error:
        "WhatsApp non configuré. Vérifiez les variables et autorisations Meta.",
    };
  const state = await createOAuthState(organization.id, user.id, "whatsapp");
  return {
    state,
    appId: process.env.META_APP_ID!,
    configId: process.env.WHATSAPP_CONFIG_ID!,
    version: graphVersion(),
  };
}
export async function finishWhatsApp(input: unknown) {
  const { user } = await tenant(["owner", "admin"]);
  const parsed = z
    .object({
      state: z.string(),
      code: z.string().min(1).max(4000),
      phoneId: z.string().regex(/^\d+$/),
      wabaId: z.string().regex(/^\d+$/),
      pin: z.string().regex(/^\d{6}$/),
    })
    .parse(input);
  try {
    const org = await consumeOAuthState(parsed.state, user.id, "whatsapp");
    await connectWhatsApp(
      parsed.code,
      org,
      parsed.phoneId,
      parsed.wabaId,
      parsed.pin,
    );
    return { ok: true };
  } catch {
    return {
      error:
        "Connexion non validée : vérifiez les permissions, le numéro autorisé et l’éligibilité du compte Meta.",
    };
  }
}
export async function disconnectChannel(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const channelId = z.uuid().parse(form.get("id"));
  const { data: channel } = await client
    .from("channels")
    .select("id,provider,external_account_id,business_account_id")
    .eq("organization_id", organization.id)
    .eq("id", channelId)
    .single();
  if (!channel) finish("/app/canaux", "Canal inaccessible.");
  const admin = serviceDb();
  const { data: credential } = await admin
    .from("channel_credentials")
    .select("ciphertext")
    .eq("organization_id", organization.id)
    .eq("channel_id", channelId)
    .single();
  let remote = false;
  try {
    if (credential) {
      const token = decryptToken(credential.ciphertext);
      if (channel.provider === "instagram") {
        await graphRequest("instagram", "me/permissions", token, {
          method: "DELETE",
        });
        remote = true;
      } else {
        const { count } = await admin
          .from("channels")
          .select("id", { count: "exact", head: true })
          .eq("business_account_id", channel.business_account_id)
          .eq("status", "connected")
          .neq("id", channelId);
        if (!count)
          await graphRequest(
            "whatsapp",
            channel.business_account_id + "/subscribed_apps",
            token,
            { method: "DELETE" },
          );
        remote = true;
      }
    }
  } catch {}
  const { error } = await admin.rpc("disconnect_channel", {
    _org: organization.id,
    _channel: channelId,
  });
  finish(
    "/app/canaux",
    error
      ? dbMessage(error.message)
      : remote
        ? "Canal déconnecté et jeton local supprimé."
        : "Canal déconnecté localement et jeton supprimé. Révoquez également Sellora dans les paramètres Meta : la révocation distante n’a pas été confirmée.",
  );
}
export async function setAssistantMode(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const mode = z
    .enum(["simulation", "suggestion_only", "automatic"])
    .parse(form.get("mode"));
  if (
    mode !== "simulation" &&
    !metaReady("instagram") &&
    !metaReady("whatsapp")
  )
    finish(
      "/app/canaux",
      "Les API Meta ne sont pas configurées. Le mode simulation reste disponible.",
    );
  const { error } = await client.rpc("set_assistant_mode", {
    _org: organization.id,
    _mode: mode,
    _explicit: form.get("explicit") === "on",
  });
  finish(
    "/app/canaux",
    error
      ? "Le mode automatique exige une activation explicite, des droits actifs et un canal connecté."
      : "Mode de réponse enregistré.",
  );
}
export async function saveSocialAsset(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const row = z
    .object({
      provider: z.enum(["instagram", "whatsapp"]),
      external_id: z.string().trim().min(1).max(200),
      product_id: z.uuid(),
    })
    .parse(Object.fromEntries(form));
  const { error } = await client
    .from("social_media_assets")
    .upsert(
      { ...row, organization_id: organization.id },
      { onConflict: "organization_id,provider,external_id,product_id" },
    );
  finish(
    "/app/canaux",
    error
      ? "Association non enregistrée. Vérifiez le produit de cette boutique."
      : "Association enregistrée. Elle sera utilisée uniquement si Meta transmet réellement cet identifiant.",
  );
}
export async function deleteSocialAsset(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const { error } = await client
    .from("social_media_assets")
    .delete()
    .eq("organization_id", organization.id)
    .eq("id", z.uuid().parse(form.get("id")));
  finish(
    "/app/canaux",
    error ? "Suppression impossible." : "Association supprimée.",
  );
}
