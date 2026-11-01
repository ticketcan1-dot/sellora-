export type Provider = "instagram" | "whatsapp";
export type NormalizedEvent = {
  accountId: string;
  externalId: string;
  kind: "message" | "unsupported" | "status";
  message_id: string;
  timestamp: string;
  sender?: string;
  name?: string;
  text?: string;
  delivery_status?: "sent" | "delivered" | "read" | "failed";
  media?: { provider: Provider; id?: string; url?: string };
  asset_id?: string;
};
function object(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function array(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function string(v: unknown, max = 12000): string {
  return typeof v === "string"
    ? v.slice(0, max)
    : typeof v === "number"
      ? String(v)
      : "";
}
function timestamp(v: unknown, now: number) {
  const raw = Number(v);
  const milliseconds = raw < 100000000000 ? raw * 1000 : raw;
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds > now + 300000 ||
    milliseconds < now - 7 * 86400000
  )
    return null;
  return new Date(milliseconds).toISOString();
}
export function normalizeMetaPayload(
  provider: Provider,
  payload: unknown,
  now = Date.now(),
): NormalizedEvent[] {
  const result: NormalizedEvent[] = [];
  for (const entryRaw of array(object(payload).entry)) {
    const entry = object(entryRaw);
    if (provider === "whatsapp")
      for (const changeRaw of array(entry.changes)) {
        const value = object(object(changeRaw).value);
        const accountId = string(object(value.metadata).phone_number_id, 100);
        if (!accountId) continue;
        for (const raw of array(value.messages)) {
          const m = object(raw);
          const id = string(m.id, 250);
          const at = timestamp(m.timestamp, now);
          const sender = string(m.from, 100);
          if (!id || !at || !sender) continue;
          const contact = array(value.contacts)
            .map(object)
            .find((c) => string(c.wa_id) === sender);
          const name = string(object(contact?.profile).name, 160);
          const type = string(m.type);
          const text =
            type === "text"
              ? string(object(m.text).body)
              : type === "interactive"
                ? string(object(object(m.interactive).button_reply).title) ||
                  string(object(object(m.interactive).list_reply).title)
                : "";
          const mediaId =
            type === "image" ? string(object(m.image).id, 200) : "";
          result.push({
            accountId,
            externalId: accountId + ":" + id,
            kind: text || mediaId ? "message" : "unsupported",
            message_id: id,
            timestamp: at,
            sender,
            name,
            text:
              text ||
              (mediaId
                ? "[Image reçue]"
                : "[Contenu non pris en charge : réponse humaine requise]"),
            ...(mediaId ? { media: { provider, id: mediaId } } : {}),
          });
        }
        for (const raw of array(value.statuses)) {
          const status = object(raw);
          const id = string(status.id, 250);
          const at = timestamp(status.timestamp, now);
          const state = string(status.status);
          if (
            !id ||
            !at ||
            !["sent", "delivered", "read", "failed"].includes(state)
          )
            continue;
          result.push({
            accountId,
            externalId: `${accountId}:${id}:${state}:${at}`,
            kind: "status",
            message_id: id,
            timestamp: at,
            delivery_status: state as "sent" | "delivered" | "read" | "failed",
          });
        }
      }
    if (provider === "instagram")
      for (const raw of array(entry.messaging)) {
        const event = object(raw);
        const m = object(event.message);
        if (m.is_echo === true) continue;
        const accountId = string(entry.id || object(event.recipient).id, 100);
        const sender = string(object(event.sender).id, 100);
        const id = string(m.mid, 250);
        const at = timestamp(event.timestamp, now);
        if (!accountId || !sender || !id || !at) continue;
        const text = string(m.text);
        const attachments = array(m.attachments).map(object);
        const image = attachments.find((a) => a.type === "image");
        const url = string(object(image?.payload).url, 4000);
        const storyId = string(object(object(m.reply_to).story).id, 200);
        result.push({
          accountId,
          externalId: accountId + ":" + id,
          kind: text || url || storyId ? "message" : "unsupported",
          message_id: id,
          timestamp: at,
          sender,
          text:
            text ||
            (url
              ? "[Image reçue]"
              : storyId
                ? "[Réponse à une story]"
                : "[Partage ou contenu non pris en charge : réponse humaine requise]"),
          ...(url ? { media: { provider, url } } : {}),
          ...(storyId ? { asset_id: storyId } : {}),
        });
      }
  }
  return result;
}
