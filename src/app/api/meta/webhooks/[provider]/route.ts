import { NextRequest, NextResponse, after } from "next/server";
import { boundedBody } from "@/lib/http-body";
import { createHash, timingSafeEqual } from "node:crypto";
import { verifyMetaSignature } from "@/domains/integrations/security";
import { normalizeMetaPayload } from "@/domains/integrations/normalizer";
import { serviceDb } from "@/lib/supabase/server";
import { processJobs } from "@/domains/integrations/worker";
export const maxDuration = 60;
function equal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function GET(request: NextRequest) {
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!token || process.env.META_ENABLED !== "true")
    return new NextResponse("Not configured", { status: 503 });
  if (
    request.nextUrl.searchParams.get("hub.mode") === "subscribe" &&
    equal(request.nextUrl.searchParams.get("hub.verify_token") || "", token)
  )
    return new NextResponse(
      request.nextUrl.searchParams.get("hub.challenge") || "",
      { headers: { "Content-Type": "text/plain" } },
    );
  return new NextResponse("Forbidden", { status: 403 });
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (provider !== "instagram" && provider !== "whatsapp")
    return new NextResponse("Unknown provider", { status: 404 });
  const secret =
    provider === "instagram"
      ? process.env.INSTAGRAM_APP_SECRET
      : process.env.META_APP_SECRET;
  if (!secret || process.env.META_ENABLED !== "true")
    return new NextResponse("Not configured", { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > 256000)
    return new NextResponse("Too large", { status: 413 });
  let raw: Uint8Array;
  try {
    raw = await boundedBody(request, 256000);
  } catch {
    return new NextResponse("Too large", { status: 413 });
  }
  if (raw.length > 256000)
    return new NextResponse("Too large", { status: 413 });
  if (
    !verifyMetaSignature(
      raw,
      request.headers.get("x-hub-signature-256") || "",
      secret,
    )
  )
    return new NextResponse("Invalid signature", { status: 401 });
  let payload;
  try {
    payload = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const events = normalizeMetaPayload(provider, payload);
  const admin = serviceDb();
  if (events.length) {
    const accounts = [...new Set(events.map((e) => e.accountId))];
    const { data: channels, error } = await admin
      .from("channels")
      .select("id,organization_id,external_account_id")
      .eq("provider", provider)
      .in("external_account_id", accounts)
      .in("status", ["connected", "error"]);
    if (error) return new NextResponse("Retry later", { status: 503 });
    const channelMap = new Map(
      (channels || []).map((c) => [c.external_account_id, c]),
    );
    const rows = events.flatMap((event) => {
      const channel = channelMap.get(event.accountId);
      return channel
        ? [
            {
              organization_id: channel.organization_id,
              channel_id: channel.id,
              provider,
              external_id: createHash("sha256")
                .update(event.externalId)
                .digest("hex"),
              payload: event,
            },
          ]
        : [];
    });
    if (rows.length) {
      const { error } = await admin.from("webhook_events").upsert(rows, {
        onConflict: "provider,external_id",
        ignoreDuplicates: true,
      });
      if (error) return new NextResponse("Retry later", { status: 503 });
      const { data: saved, error: readError } = await admin
        .from("webhook_events")
        .select("id,external_id,organization_id,channel_id,status")
        .eq("provider", provider)
        .in(
          "external_id",
          rows.map((r) => r.external_id),
        );
      if (readError) return new NextResponse("Retry later", { status: 503 });
      const expected = new Map(rows.map((r) => [r.external_id, r]));
      const scoped = (saved || []).filter(
        (e) =>
          e.status !== "completed" &&
          e.status !== "dead" &&
          expected.get(e.external_id)?.organization_id === e.organization_id &&
          expected.get(e.external_id)?.channel_id === e.channel_id,
      );
      // Make every incoming message visible before acknowledging the batch.
      // AI/media processing remains durable and asynchronous.
      for (let i = 0; i < scoped.length; i += 10) {
        const results = await Promise.all(
          scoped
            .slice(i, i + 10)
            .map((e) => admin.rpc("ingest_meta_event", { _event: e.id })),
        );
        if (results.some((r) => r.error))
          return new NextResponse("Retry later", { status: 503 });
      }
    }
  }
  after(async () => {
    await processJobs({ webhooks: 1, outbound: 1 }).catch(() => undefined);
  });
  return NextResponse.json({ received: true });
}
