import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { renewOneInstagramToken } from "@/domains/integrations/renewal";
import { processJobs } from "@/domains/integrations/worker";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24)
    return NextResponse.json(
      { error: "Scheduler not configured" },
      { status: 503 },
    );
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from("Bearer " + secret);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const renewal = await renewOneInstagramToken();
    return NextResponse.json(
      { ...(await processJobs({ webhooks: 1, outbound: 1 })), renewal },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json({ error: "Queue unavailable" }, { status: 503 });
  }
}
export const POST = GET;
