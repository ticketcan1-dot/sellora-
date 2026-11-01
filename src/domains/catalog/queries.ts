import "server-only";
import { tenant } from "@/domains/tenants/access";
import type { Product } from "./schema";
export async function catalogForCurrentShop() {
  const { client, organization, role } = await tenant();
  const products: Product[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from("products")
      .select("*,product_variants(*),product_images(*)")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Catalogue indisponible.");
    products.push(...((data || []) as Product[]));
    if (!data || data.length < 500) break;
  }
  const images = products.flatMap((p) => p.product_images);
  const urls = new Map<string, string>();
  for (let offset = 0; offset < images.length; offset += 100) {
    const { data, error } = await client.storage
      .from("catalog")
      .createSignedUrls(
        images.slice(offset, offset + 100).map((i) => i.path),
        900,
      );
    if (error)
      throw new Error(
        "Photos indisponibles. Réessayez pour renouveler les liens privés.",
      );
    for (const image of data || [])
      if (image.path && image.signedUrl) urls.set(image.path, image.signedUrl);
  }
  return {
    organization,
    role,
    products: products.map((p) => ({
      ...p,
      product_images: p.product_images.map((i) => ({
        ...i,
        url: urls.get(i.path),
      })),
    })),
  };
}
