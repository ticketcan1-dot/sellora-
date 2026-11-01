import { tenant } from "@/domains/tenants/access";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const { client, organization } = await tenant(["owner", "admin"]);
  const tables = [
    "products",
    "product_variants",
    "product_images",
    "social_media_assets",
    "customers",
    "conversations",
    "messages",
    "conversation_notes",
    "ai_settings",
    "ai_suggestions",
    "orders",
    "order_items",
    "order_history",
    "payment_records",
    "memberships",
    "subscriptions",
    "usage_events",
    "audit_logs",
  ] as const;
  const { data: fullOrganization, error: organizationError } = await client
    .from("organizations")
    .select("*")
    .eq("id", organization.id)
    .single();
  if (organizationError)
    return NextResponse.json(
      { error: "Organization unavailable" },
      { status: 503 },
    );
  const result: Record<string, unknown> = {
    organization: fullOrganization,
    exported_at: new Date().toISOString(),
  };
  for (const table of tables) {
    const rows: unknown[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .eq("organization_id", organization.id)
        .range(offset, offset + 499);
      if (error)
        return NextResponse.json(
          {
            error:
              "Export incomplet. Réessayez après vérification des migrations.",
          },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      rows.push(...data);
      if (data.length < 500) break;
    }
    result[table] = rows;
  }
  const { error: auditError } = await client.rpc("log_export", {
    _org: organization.id,
  });
  if (auditError)
    return NextResponse.json(
      { error: "Export audit unavailable" },
      { status: 503 },
    );
  return new NextResponse(JSON.stringify(result, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sellora-export.json"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
