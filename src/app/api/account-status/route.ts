import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/server";
import { configured } from "@/lib/config";
export const dynamic = "force-dynamic";
export async function GET() {
  const response = (body: object, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!configured()) return response({ error: "not_configured" }, 503);
  const client = await db();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    return response({ error: "authentication_required" }, 401);
  const { data, error: profileError } = await client
    .from("profiles")
    .select("approval_status")
    .eq("id", user.id)
    .single();
  if (profileError) return response({ error: "approval_unavailable" }, 503);
  return response({ status: data.approval_status });
}
