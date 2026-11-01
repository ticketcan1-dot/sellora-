import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
export async function allCatalogPaths(client: SupabaseClient, org: string) {
  const paths: string[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await client
      .from("product_images")
      .select("path")
      .eq("organization_id", org)
      .order("id")
      .range(page * 500, page * 500 + 499);
    if (error) throw new Error("File inventory unavailable");
    paths.push(...data.map((x) => x.path));
    if (data.length < 500) return paths;
  }
}
export async function incomingPaths(
  client: SupabaseClient,
  org: string,
  cutoff?: string,
) {
  const paths: string[] = [];
  for (let page = 0; ; page++) {
    let query = client
      .from("messages")
      .select("id,image_path,conversations!inner(status)")
      .eq("organization_id", org)
      .not("image_path", "is", null)
      .order("id")
      .range(page * 500, page * 500 + 499);
    if (cutoff)
      query = query
        .lt("created_at", cutoff)
        .eq("conversations.status", "closed");
    const { data, error } = await query;
    if (error) throw new Error("Media inventory unavailable");
    for (const row of data)
      if (row.image_path?.startsWith(org + "/")) paths.push(row.image_path);
    if (data.length < 500) return paths;
  }
}
export async function removeOwnedPaths(
  admin: SupabaseClient,
  bucket: "catalog" | "simulation",
  org: string,
  paths: string[],
) {
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    if (batch.some((p) => !p.startsWith(org + "/")))
      throw new Error("Invalid owned file path");
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) throw new Error("File cleanup unavailable");
  }
}
