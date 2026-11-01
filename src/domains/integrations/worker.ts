import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { appUrl } from "@/lib/config";
import { z } from "zod";
import { serviceDb } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/config";
import { decryptToken } from "./security";
import { metaReady, sendMetaText, MetaRequestError } from "./meta-api";
import { downloadMetaImage } from "./media";
import {
  inferForConversation,
  suggestionFingerprint,
} from "@/domains/ai/inference";
import { settingsSchema } from "@/domains/ai/schema";
import type { Product } from "@/domains/catalog/schema";
const outboxSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  conversation_id: z.uuid(),
  message_id: z.uuid(),
  suggestion_id: z.uuid().nullable(),
  automatic: z.boolean(),
  actor_id: z.string().nullable(),
  attempts: z.number().int(),
});
const suggestionSchema = z.object({
  id: z.uuid(),
  content: z.string(),
  needs_human: z.boolean(),
  status: z.string(),
});
export async function validSuggestion(org: string, id: string) {
  const client = serviceDb();
  const { data: s, error } = await client
    .from("ai_suggestions")
    .select("product_ids,catalog_fingerprint,created_at")
    .eq("organization_id", org)
    .eq("id", id)
    .single();
  if (error || !s?.catalog_fingerprint) return false;
  const [{ data: settings, error: se }, { data: products, error: pe }] =
    await Promise.all([
      client
        .from("ai_settings")
        .select("*")
        .eq("organization_id", org)
        .single(),
      s.product_ids.length
        ? client
            .from("products")
            .select("*,product_variants(*),product_images(*)")
            .eq("organization_id", org)
            .in("id", s.product_ids)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (se || pe) return false;
  const config = settingsSchema.parse(settings);
  if (config.paused) return false;
  return (
    suggestionFingerprint(products as Product[], config) ===
    s.catalog_fingerprint
  );
}
export async function createAiSuggestion(
  org: string,
  conversation: string,
  messageId: string,
  assetId?: string,
  force = false,
) {
  const client = serviceDb();
  const { data: existing } = await client
    .from("ai_suggestions")
    .select("id,content,needs_human,status")
    .eq("organization_id", org)
    .eq("source_message_id", messageId)
    .maybeSingle();
  if (existing && (!force || existing.status === "approved"))
    return suggestionSchema.parse(existing);
  if (!aiConfigured()) return null;
  const [
    { data: thread, error: te },
    { data: message, error: me },
    { data: settings, error: se },
  ] = await Promise.all([
    client
      .from("conversations")
      .select("ai_paused,status")
      .eq("organization_id", org)
      .eq("id", conversation)
      .single(),
    client
      .from("messages")
      .select("content,image_path")
      .eq("organization_id", org)
      .eq("conversation_id", conversation)
      .eq("id", messageId)
      .eq("role", "user")
      .single(),
    client
      .from("ai_settings")
      .select("mode,paused")
      .eq("organization_id", org)
      .single(),
  ]);
  if (
    te ||
    me ||
    se ||
    thread.ai_paused ||
    thread.status === "human" ||
    thread.status === "closed" ||
    settings.paused
  )
    return null;
  const { data: usage, error: quotaError } = await client.rpc(
    "reserve_background_ai",
    { _org: org },
  );
  if (quotaError) return null;
  try {
    let imageDataUrl: string | undefined;
    if (message.image_path) {
      const { data, error } = await client.storage
        .from("simulation")
        .download(message.image_path);
      if (error) throw new Error("Image unavailable");
      imageDataUrl =
        "data:image/webp;base64," +
        Buffer.from(await data.arrayBuffer()).toString("base64");
    }
    const result = await inferForConversation(
      client,
      org,
      conversation,
      message.content,
      imageDataUrl,
      assetId,
    );
    let replyContent = result.content;
    let needsHuman = result.needsHuman || result.content.length > 1000;
    if (result.purchase) {
      if (!needsHuman && result.variantId) {
        const token = randomBytes(32).toString("base64url");
        const { error } = await client.rpc("create_ai_checkout", {
          _org: org,
          _conversation: conversation,
          _variant: result.variantId,
          _quantity: result.quantity,
          _hash: createHash("sha256").update(token).digest("hex"),
        });
        if (!error) {
          const label =
            result.language === "fr"
              ? "Confirmez les produits, le montant et vos coordonnées sur ce lien privé :"
              : result.language === "ar"
                ? "يرجى تأكيد المنتجات والمبلغ وبيانات التوصيل عبر هذا الرابط الخاص:"
                : "أكد المنتوج والثمن ومعلومات التوصيل فهاد الرابط الخاص:";
          replyContent +=
            "\n\n" + label + "\n" + appUrl() + "/commande/" + token;
        } else needsHuman = true;
      } else needsHuman = true;
    }
    const { data: current } = await client
      .from("ai_settings")
      .select("paused")
      .eq("organization_id", org)
      .single();
    if (!current || current.paused) throw new Error("Assistant paused");
    const { data: latest } = await client
      .from("messages")
      .select("id")
      .eq("organization_id", org)
      .eq("conversation_id", conversation)
      .eq("role", "user")
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const suggestionValues = {
      organization_id: org,
      conversation_id: conversation,
      source_message_id: messageId,
      content: replyContent,
      product_ids: result.productIds,
      needs_human:
        needsHuman || replyContent.length > 1000 || latest?.id !== messageId,
      catalog_fingerprint: result.fingerprint,
      status: "pending",
    };
    const write = existing
      ? client
          .from("ai_suggestions")
          .update(suggestionValues)
          .eq("id", existing.id)
          .eq("organization_id", org)
          .eq("status", existing.status)
      : client.from("ai_suggestions").insert(suggestionValues);
    const { data, error } = await write
      .select("id,content,needs_human,status")
      .single();
    if (error) throw error;
    if (suggestionValues.needs_human)
      await client
        .from("conversations")
        .update({ status: "human" })
        .eq("organization_id", org)
        .eq("id", conversation);
    await client
      .from("usage_events")
      .update({
        status: "completed",
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      })
      .eq("id", usage)
      .eq("organization_id", org);
    return suggestionSchema.parse(data);
  } catch {
    await client
      .from("usage_events")
      .update({ status: "failed" })
      .eq("id", usage)
      .eq("organization_id", org);
    return null;
  }
}
export async function processOutbound(id?: string) {
  const client = serviceDb();
  const { data, error } = await client.rpc("claim_outbox", { _id: id || null });
  if (error) throw new Error("Outbox unavailable");
  if (!data?.length) return "not_due";
  const job = outboxSchema.parse(data[0]);
  const set = async (
    status: "queued" | "sent" | "failed" | "unknown",
    code?: string,
    externalId?: string,
    retryAfterMs = 0,
  ) => {
    const retry = status === "queued";
    const next = new Date(
      Date.now() +
        Math.min(
          3600000,
          Math.max(60000, retryAfterMs, 1000 * 2 ** job.attempts),
        ),
    );
    await client
      .from("message_outbox")
      .update({
        status,
        error_code: code || null,
        lease_until: null,
        ...(retry ? { next_attempt_at: next.toISOString() } : {}),
      })
      .eq("id", job.id);
    await client
      .from("messages")
      .update({
        delivery_status: status === "queued" ? "queued" : status,
        ...(externalId ? { external_id: externalId } : {}),
      })
      .eq("id", job.message_id)
      .eq("organization_id", job.organization_id);
    return status;
  };
  try {
    const [
      { data: thread, error: te },
      { data: message, error: me },
      { data: org },
      { data: sub },
    ] = await Promise.all([
      client
        .from("conversations")
        .select("*")
        .eq("organization_id", job.organization_id)
        .eq("id", job.conversation_id)
        .single(),
      client
        .from("messages")
        .select("content")
        .eq("organization_id", job.organization_id)
        .eq("id", job.message_id)
        .single(),
      client
        .from("organizations")
        .select("is_active")
        .eq("id", job.organization_id)
        .single(),
      client
        .from("subscriptions")
        .select("status,trial_ends_at,manual_until")
        .eq("organization_id", job.organization_id)
        .single(),
    ]);
    if (
      te ||
      me ||
      !org?.is_active ||
      !sub ||
      thread.status === "closed" ||
      !thread.last_inbound_at ||
      new Date(thread.last_inbound_at).getTime() <= Date.now() - 86400000
    )
      return await set("failed", "window_or_access_closed");
    const rights =
      sub.status === "trial"
        ? new Date(sub.trial_ends_at) > new Date()
        : sub.status === "manual" &&
          sub.manual_until &&
          new Date(sub.manual_until) > new Date();
    if (!rights) return await set("failed", "entitlements_expired");
    if (!job.automatic) {
      if (!job.actor_id) return await set("failed", "sender_access_revoked");
      const { data: member } = await client
        .from("memberships")
        .select("user_id")
        .eq("organization_id", job.organization_id)
        .eq("user_id", job.actor_id)
        .in("role", ["owner", "admin", "agent"])
        .maybeSingle();
      const { data: profile } = await client
        .from("profiles")
        .select("approval_status")
        .eq("id", job.actor_id)
        .single();
      if (!member || profile?.approval_status !== "approved")
        return await set("failed", "sender_access_revoked");
    }
    const { data: owners } = await client
      .from("memberships")
      .select("user_id")
      .eq("organization_id", job.organization_id)
      .eq("role", "owner");
    const { data: approvedOwner } = owners?.length
      ? await client
          .from("profiles")
          .select("id")
          .in(
            "id",
            owners.map((x) => x.user_id),
          )
          .eq("approval_status", "approved")
          .limit(1)
      : { data: [] };
    if (!approvedOwner?.length)
      return await set("failed", "owner_access_revoked");
    const { data: channel, error: ce } = await client
      .from("channels")
      .select("*")
      .eq("organization_id", job.organization_id)
      .eq("id", thread.channel_id)
      .eq("status", "connected")
      .single();
    if (ce || !channel || !metaReady(channel.provider))
      return await set("failed", "channel_not_configured");
    if (
      job.suggestion_id &&
      !(await validSuggestion(job.organization_id, job.suggestion_id))
    )
      return await set("failed", "suggestion_outdated");
    if (job.automatic) {
      const { data: source } = await client
        .from("ai_suggestions")
        .select("source_message_id")
        .eq("organization_id", job.organization_id)
        .eq("id", job.suggestion_id)
        .single();
      const { data: latest } = await client
        .from("messages")
        .select("id")
        .eq("organization_id", job.organization_id)
        .eq("conversation_id", job.conversation_id)
        .eq("role", "user")
        .order("occurred_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!source?.source_message_id || source.source_message_id !== latest?.id)
        return await set("failed", "newer_customer_message");
      const { data: s } = await client
        .from("ai_settings")
        .select("mode,paused")
        .eq("organization_id", job.organization_id)
        .single();
      if (
        s?.mode !== "automatic" ||
        s.paused ||
        thread.ai_paused ||
        thread.status !== "open"
      )
        return await set("failed", "automation_paused");
    }
    const { data: credential, error: cre } = await client
      .from("channel_credentials")
      .select("ciphertext,expires_at")
      .eq("organization_id", job.organization_id)
      .eq("channel_id", channel.id)
      .single();
    if (
      cre ||
      !credential ||
      (credential.expires_at && new Date(credential.expires_at) <= new Date())
    )
      return await set("failed", "channel_token_expired");
    const externalId = await sendMetaText(
      channel.provider,
      channel.external_account_id,
      thread.external_contact_id,
      message.content,
      decryptToken(credential.ciphertext),
    );
    return await set("sent", undefined, externalId);
  } catch (error) {
    if (error instanceof MetaRequestError) {
      if (error.status === 429 && job.attempts < 5)
        return await set(
          "queued",
          "provider_rate_limit",
          undefined,
          error.retryAfterMs,
        );
      if (error.code === 190 || error.status === 401) {
        await client
          .from("channels")
          .update({
            status: "error",
            last_error: "Accès expiré ou révoqué. Reconnectez le canal.",
          })
          .eq("organization_id", job.organization_id)
          .in(
            "id",
            (
              await client
                .from("conversations")
                .select("channel_id")
                .eq("id", job.conversation_id)
            ).data?.map((t) => t.channel_id) || [],
          );
        return await set("failed", "token_invalid");
      }
      if (error.status < 500) return await set("failed", "provider_rejected");
    }
    // A timeout or 5xx may have happened after acceptance. Do not resend blindly.
    return await set("unknown", "delivery_uncertain");
  }
}
async function processEmail() {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return false;
  const client = serviceDb();
  const { data, error } = await client.rpc("claim_email_jobs");
  if (error || !data?.length) return false;
  const job = z
    .object({
      id: z.uuid(),
      recipient: z.email(),
      subject: z.string(),
      content: z.string(),
      attempts: z.number(),
    })
    .parse(data[0]);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": job.id,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [job.recipient],
        subject: job.subject,
        text: job.content,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 429 && job.attempts < 5) {
      await client
        .from("email_jobs")
        .update({
          status: "pending",
          next_attempt_at: new Date(
            Date.now() + 60000 * job.attempts,
          ).toISOString(),
          lease_until: null,
        })
        .eq("id", job.id);
      return true;
    }
    const body = await response.json();
    if (!response.ok || typeof body.id !== "string")
      throw new Error("Email rejected");
    await client
      .from("email_jobs")
      .update({ status: "sent", external_id: body.id, lease_until: null })
      .eq("id", job.id);
  } catch {
    await client
      .from("email_jobs")
      .update({ status: "failed", lease_until: null })
      .eq("id", job.id);
  }
  return true;
}
export async function processJobs(options: {
  webhooks: number;
  outbound: number;
}) {
  const client = serviceDb();
  let received = 0;
  let outbound = 0;
  const { data: events, error } =
    process.env.META_ENABLED === "true"
      ? await client.rpc("claim_webhooks", {
          _limit: Math.min(options.webhooks, 3),
        })
      : { data: [], error: null };
  if (error) throw new Error("Webhook queue unavailable");
  for (const event of events || []) {
    try {
      const { data: messageId, error } = await client.rpc("ingest_meta_event", {
        _event: event.id,
      });
      if (error) throw error;
      let message = messageId;
      if (!message && event.payload.kind !== "status") {
        const { data } = await client
          .from("messages")
          .select("id")
          .eq("organization_id", event.organization_id)
          .eq("external_id", event.payload.message_id)
          .maybeSingle();
        message = data?.id;
      }
      if (message && event.payload.media) {
        const { data: existing } = await client
          .from("messages")
          .select("image_path")
          .eq("id", message)
          .single();
        if (!existing?.image_path) {
          try {
            const { data: credential } = await client
              .from("channel_credentials")
              .select("ciphertext")
              .eq("channel_id", event.channel_id)
              .eq("organization_id", event.organization_id)
              .single();
            if (!credential) throw new Error("Media token unavailable");
            const image = await downloadMetaImage(
              event.payload.media,
              decryptToken(credential.ciphertext),
            );
            const path = `${event.organization_id}/${message}.webp`;
            const { error } = await client.storage
              .from("simulation")
              .upload(path, image, { contentType: "image/webp", upsert: true });
            if (error) throw error;
            await client
              .from("messages")
              .update({ image_path: path })
              .eq("id", message)
              .eq("organization_id", event.organization_id);
          } catch {
            const { data: msg } = await client
              .from("messages")
              .select("conversation_id")
              .eq("id", message)
              .single();
            if (msg)
              await client
                .from("conversations")
                .update({ status: "human" })
                .eq("id", msg.conversation_id)
                .eq("organization_id", event.organization_id);
          }
        }
      }
      if (message && event.payload.kind !== "unsupported") {
        const { data: msg } = await client
          .from("messages")
          .select("conversation_id")
          .eq("organization_id", event.organization_id)
          .eq("id", message)
          .single();
        if (msg) {
          const { data: settings } = await client
            .from("ai_settings")
            .select("mode,paused")
            .eq("organization_id", event.organization_id)
            .single();
          if (settings && !settings.paused && settings.mode !== "simulation") {
            const suggestion = await createAiSuggestion(
              event.organization_id,
              msg.conversation_id,
              message,
              event.payload.asset_id,
            );
            if (
              suggestion &&
              !suggestion.needs_human &&
              suggestion.status === "pending" &&
              settings.mode === "automatic"
            ) {
              if (await validSuggestion(event.organization_id, suggestion.id))
                await client.rpc("queue_automatic_reply", {
                  _org: event.organization_id,
                  _conversation: msg.conversation_id,
                  _content: suggestion.content,
                  _request: suggestion.id,
                  _suggestion: suggestion.id,
                });
            }
          }
        }
      }
      await client
        .from("webhook_events")
        .update({
          status: "completed",
          payload: { redacted: true },
          lease_until: null,
          error_code: null,
        })
        .eq("id", event.id);
      received++;
    } catch {
      await client
        .from("webhook_events")
        .update({
          status: event.attempts >= 6 ? "dead" : "failed",
          next_attempt_at: new Date(
            Date.now() + Math.min(3600000, 1000 * 2 ** event.attempts),
          ).toISOString(),
          lease_until: null,
          error_code: "processing_failed",
        })
        .eq("id", event.id);
    }
  }
  for (
    let i = 0;
    i <
    (process.env.META_ENABLED === "true" ? Math.min(options.outbound, 3) : 0);
    i++
  ) {
    const result = await processOutbound();
    if (result === "not_due") break;
    outbound++;
  }
  await processEmail();
  await client
    .from("webhook_events")
    .update({ payload: { redacted: true }, status: "dead" })
    .lt("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .neq("status", "completed");
  await client
    .from("oauth_states")
    .delete()
    .lt("expires_at", new Date(Date.now() - 86400000).toISOString());
  await client.rpc("cleanup_technical_events");
  return { received, outbound };
}
