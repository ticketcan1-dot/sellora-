import "server-only";
import { z } from "zod";
export class MetaRequestError extends Error {
  constructor(
    public status: number,
    public code: number | undefined,
    public retryAfterMs = 0,
  ) {
    super("Meta API request failed");
  }
}
export function graphVersion() {
  const value = process.env.META_GRAPH_VERSION;
  if (!value || !/^v\d{2}\.0$/.test(value))
    throw new Error("Configurez une version Graph API prise en charge.");
  return value;
}
export function metaReady(provider: "instagram" | "whatsapp") {
  if (
    process.env.META_ENABLED !== "true" ||
    !/^v\d{2}\.0$/.test(process.env.META_GRAPH_VERSION || "") ||
    !process.env.META_WEBHOOK_VERIFY_TOKEN ||
    Buffer.from(process.env.CHANNEL_ENCRYPTION_KEY || "", "base64").length !==
      32
  )
    return false;
  return provider === "instagram"
    ? Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET)
    : Boolean(
        process.env.META_APP_ID &&
        process.env.META_APP_SECRET &&
        process.env.WHATSAPP_CONFIG_ID,
      );
}
export async function graphRequest(
  provider: "instagram" | "whatsapp",
  path: string,
  token: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
  } = {},
) {
  const host =
    provider === "instagram" ? "graph.instagram.com" : "graph.facebook.com";
  const url = new URL(
    `https://${host}/${graphVersion()}/${path.replace(/^\//, "")}`,
  );
  for (const [key, value] of Object.entries(options.query || {}))
    url.searchParams.set(key, value);
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new MetaRequestError(
      response.status,
      typeof data.error?.code === "number" ? data.error.code : undefined,
      Math.min(
        3600000,
        Math.max(0, Number(response.headers.get("retry-after")) || 0) * 1000,
      ),
    );
  return data as Record<string, unknown>;
}
export function id(value: unknown) {
  return z
    .string()
    .regex(/^\d{1,100}$/)
    .parse(value);
}
export async function sendMetaText(
  provider: "instagram" | "whatsapp",
  accountId: string,
  recipient: string,
  text: string,
  token: string,
) {
  const data = await graphRequest(
    provider,
    id(accountId) + "/messages",
    token,
    {
      method: "POST",
      body:
        provider === "whatsapp"
          ? {
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: recipient,
              type: "text",
              text: { body: text, preview_url: false },
            }
          : { recipient: { id: recipient }, message: { text } },
    },
  );
  const result =
    provider === "whatsapp"
      ? z.array(z.object({ id: z.string() })).parse(data.messages)[0]?.id
      : z.string().parse(data.message_id);
  if (!result) throw new Error("Meta returned no message ID");
  return result;
}
