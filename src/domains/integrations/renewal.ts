import "server-only";
import { z } from "zod";
import { serviceDb } from "@/lib/supabase/server";
import { metaReady } from "./meta-api";
import { decryptToken, encryptToken } from "./security";
export async function renewOneInstagramToken() {
  if (!metaReady("instagram")) return false;
  const client = serviceDb();
  const { data: channels } = await client
    .from("channels")
    .select("id,organization_id")
    .eq("provider", "instagram")
    .eq("status", "connected")
    .order("updated_at")
    .limit(100);
  if (!channels?.length) return false;
  const { data: credentials } = await client
    .from("channel_credentials")
    .select("id,organization_id,channel_id,ciphertext,expires_at")
    .in(
      "channel_id",
      channels.map((c) => c.id),
    )
    .lte("expires_at", new Date(Date.now() + 7 * 86400000).toISOString())
    .gt("expires_at", new Date().toISOString())
    .order("expires_at")
    .limit(1);
  const credential = credentials?.[0];
  if (!credential) return false;
  try {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.search = new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: decryptToken(credential.ciphertext),
    }).toString();
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error("Token renewal rejected");
    const renewed = z
      .object({ access_token: z.string(), expires_in: z.number().positive() })
      .parse(data);
    const { error } = await client
      .from("channel_credentials")
      .update({
        ciphertext: encryptToken(renewed.access_token),
        expires_at: new Date(
          Date.now() + renewed.expires_in * 1000,
        ).toISOString(),
      })
      .eq("id", credential.id)
      .eq("organization_id", credential.organization_id);
    if (error) throw error;
    await client
      .from("channels")
      .update({ last_error: null })
      .eq("id", credential.channel_id)
      .eq("organization_id", credential.organization_id);
    return true;
  } catch {
    await client
      .from("channels")
      .update({
        last_error:
          "Renouvellement non confirmé. Vérifiez les droits et reconnectez avant expiration.",
      })
      .eq("id", credential.channel_id)
      .eq("organization_id", credential.organization_id);
    return false;
  }
}
