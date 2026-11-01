import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { tenant } from "@/domains/tenants/access";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const { client, organization } = await tenant();
  const raw = request.nextUrl.searchParams.get("conversation");
  const id = raw ? z.uuid().safeParse(raw) : null;
  if (id && !id.success)
    return NextResponse.json(
      { error: "Invalid conversation" },
      { status: 400 },
    );
  const queries = [
    client
      .from("conversations")
      .select("id,updated_at")
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false })
      .limit(1),
  ];
  if (id?.success)
    for (const table of ["messages", "ai_suggestions", "conversation_notes"])
      queries.push(
        client
          .from(table)
          .select("id,updated_at")
          .eq("organization_id", organization.id)
          .eq("conversation_id", id.data)
          .order("updated_at", { ascending: false })
          .limit(1),
      );
  const results = await Promise.all(queries);
  if (results.some((r) => r.error))
    return NextResponse.json({ error: "Refresh unavailable" }, { status: 503 });
  return NextResponse.json(
    {
      version: createHash("sha256")
        .update(JSON.stringify(results.map((r) => r.data)))
        .digest("hex"),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
