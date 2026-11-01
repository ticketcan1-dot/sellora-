import { NextResponse } from "next/server";
import { z } from "zod";
import { tenant } from "@/domains/tenants/access";
import { serviceDb } from "@/lib/supabase/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { client, organization } = await tenant();
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) return new NextResponse("Not found", { status: 404 });
  const { data } = await client
    .from("messages")
    .select("image_path")
    .eq("organization_id", organization.id)
    .eq("id", parsed.data)
    .single();
  if (!data?.image_path?.startsWith(organization.id + "/"))
    return new NextResponse("Not found", { status: 404 });
  const { data: signed, error } = await serviceDb()
    .storage.from("simulation")
    .createSignedUrl(data.image_path, 60);
  if (error) return new NextResponse("Unavailable", { status: 503 });
  const response = NextResponse.redirect(signed.signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
