import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { serviceDb } from "@/lib/supabase/server";
import { metaReady, graphRequest, graphVersion, id } from "./meta-api";
import { encryptToken } from "./security";
export async function createOAuthState(
  org: string,
  user: string,
  provider: "instagram" | "whatsapp",
) {
  if (!metaReady(provider)) throw new Error("Channel not configured");
  const token = randomBytes(32).toString("base64url");
  const { error } = await serviceDb()
    .from("oauth_states")
    .insert({
      organization_id: org,
      user_id: user,
      provider,
      token_hash: createHash("sha256").update(token).digest("hex"),
    });
  if (error) throw new Error("OAuth state unavailable");
  return token;
}
export async function consumeOAuthState(
  token: string,
  user: string,
  provider: "instagram" | "whatsapp",
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new Error("Invalid OAuth state");
  const { data, error } = await serviceDb().rpc("consume_oauth_state", {
    _hash: createHash("sha256").update(token).digest("hex"),
    _user: user,
    _provider: provider,
  });
  if (error || typeof data !== "string") throw new Error("Invalid OAuth state");
  return data;
}
async function exchange(url: string, params: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const raw = await response.json();
  const data = Array.isArray(raw.data) ? raw.data[0] : raw;
  if (!response.ok) throw new Error("OAuth exchange rejected");
  return z
    .object({ access_token: z.string(), expires_in: z.number().optional() })
    .passthrough()
    .parse(data);
}
export async function connectInstagram(
  code: string,
  org: string,
  redirectUri: string,
) {
  const short = await exchange("https://api.instagram.com/oauth/access_token", {
    client_id: process.env.INSTAGRAM_APP_ID!,
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const url = new URL("https://graph.instagram.com/access_token");
  url.search = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
    access_token: short.access_token,
  }).toString();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const raw = await response.json();
  if (!response.ok) throw new Error("Long-lived token rejected");
  const long = z
    .object({ access_token: z.string(), expires_in: z.number().positive() })
    .parse(raw);
  const info = await graphRequest("instagram", "me", long.access_token, {
    query: { fields: "user_id,username" },
  });
  const account = id(info.user_id || info.id);
  const subscription = await graphRequest(
    "instagram",
    account + "/subscribed_apps",
    long.access_token,
    {
      method: "POST",
      body: { subscribed_fields: ["messages", "messaging_postbacks"] },
    },
  );
  if (subscription.success !== true && subscription.success !== "true")
    throw new Error("Webhook subscription not confirmed");
  const { error } = await serviceDb().rpc("connect_channel", {
    _org: org,
    _provider: "instagram",
    _account: account,
    _business: null,
    _name: typeof info.username === "string" ? info.username : "Instagram",
    _ciphertext: encryptToken(long.access_token),
    _expiry: new Date(Date.now() + long.expires_in * 1000).toISOString(),
  });
  if (error) throw new Error("Channel persistence failed");
}
export async function connectWhatsApp(
  code: string,
  org: string,
  phoneId: string,
  wabaId: string,
  pin: string,
) {
  id(phoneId);
  id(wabaId);
  const token = await exchange(
    `https://graph.facebook.com/${graphVersion()}/oauth/access_token`,
    {
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      code,
    },
  );
  const debug = await graphRequest(
    "whatsapp",
    "debug_token",
    process.env.META_APP_ID + "|" + process.env.META_APP_SECRET,
    { query: { input_token: token.access_token } },
  );
  const checked = z
    .object({
      is_valid: z.literal(true),
      app_id: z.string(),
      scopes: z.array(z.string()),
    })
    .parse(debug.data);
  if (
    checked.app_id !== process.env.META_APP_ID ||
    !["whatsapp_business_messaging", "whatsapp_business_management"].every(
      (p) => checked.scopes.includes(p),
    )
  )
    throw new Error("Required WhatsApp permissions missing");
  const phones = await graphRequest(
    "whatsapp",
    wabaId + "/phone_numbers",
    token.access_token,
    {
      query: { fields: "id,display_phone_number,verified_name", limit: "100" },
    },
  );
  const allowed = z
    .array(
      z.object({
        id: z.string(),
        display_phone_number: z.string().optional(),
        verified_name: z.string().optional(),
      }),
    )
    .parse(phones.data);
  const phone = allowed.find((p) => p.id === phoneId);
  if (!phone)
    throw new Error("Phone does not belong to the granted business account");
  const registered = await graphRequest(
    "whatsapp",
    phoneId + "/register",
    token.access_token,
    {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        pin: z
          .string()
          .regex(/^\d{6}$/)
          .parse(pin),
      },
    },
  );
  if (registered.success !== true && registered.success !== "true")
    throw new Error("Phone registration not confirmed");
  const subscription = await graphRequest(
    "whatsapp",
    wabaId + "/subscribed_apps",
    token.access_token,
    { method: "POST", body: {} },
  );
  if (subscription.success !== true && subscription.success !== "true")
    throw new Error("Webhook subscription not confirmed");
  const { error } = await serviceDb().rpc("connect_channel", {
    _org: org,
    _provider: "whatsapp",
    _account: phoneId,
    _business: wabaId,
    _name: phone.verified_name || phone.display_phone_number || "WhatsApp",
    _ciphertext: encryptToken(token.access_token),
    _expiry: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null,
  });
  if (error) throw new Error("Channel persistence failed");
}
