"use server";
import { revalidatePath } from "next/cache";
import { tenant, uuid } from "@/domains/tenants/access";
import { productSchema } from "./schema";
import { normalizeImage } from "./images";
export async function saveProduct(input: unknown, id?: string) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const parsed = productSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: parsed.error.issues
        .map((i) => `${i.path.join(".")} : ${i.message}`)
        .join(" · "),
    };
  const { variants, ...details } = parsed.data;
  const { data, error } = await client.rpc("save_product", {
    org: organization.id,
    product: id ? uuid.parse(id) : null,
    details,
    variants,
  });
  if (error)
    return {
      error:
        error.code === "23505"
          ? "Un SKU existe déjà dans cette boutique."
          : "Enregistrement impossible. Vérifiez les champs et les migrations.",
    };
  revalidatePath("/app");
  revalidatePath("/app/catalogue");
  return { id: data as string };
}
export async function deleteProduct(id: string) {
  const { client, organization } = await tenant(["owner", "admin"]);
  uuid.parse(id);
  const { data: images, error: readError } = await client
    .from("product_images")
    .select("path")
    .eq("organization_id", organization.id)
    .eq("product_id", id);
  if (readError) return { error: "Lecture des images impossible." };
  const { error } = await client
    .from("products")
    .delete()
    .eq("id", id)
    .eq("organization_id", organization.id);
  if (error)
    return {
      error:
        "Suppression impossible. Une commande peut référencer ce produit ; ses photos ont été conservées.",
    };
  if (images?.length) {
    const { error: storageError } = await client.storage
      .from("catalog")
      .remove(images.map((i) => i.path));
    if (storageError) {
      revalidatePath("/app");
      revalidatePath("/app/catalogue");
      return {
        error:
          "Produit supprimé. Le nettoyage de ses fichiers privés reste à effectuer dans le stockage de la boutique.",
      };
    }
  }
  revalidatePath("/app");
  revalidatePath("/app/catalogue");
  return { ok: true };
}
export async function uploadProductImage(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const id = uuid.parse(form.get("product_id"));
  const { data: product } = await client
    .from("products")
    .select("id")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .single();
  if (!product) return { error: "Produit inaccessible." };
  const file = form.get("image");
  if (!(file instanceof File)) return { error: "Image requise." };
  try {
    const buffer = await normalizeImage(file);
    const path = `${organization.id}/${id}/${crypto.randomUUID()}.webp`;
    const { error } = await client.storage
      .from("catalog")
      .upload(path, buffer, { contentType: "image/webp", upsert: false });
    if (error) return { error: "Envoi de l’image impossible." };
    const { error: rowError } = await client.from("product_images").insert({
      organization_id: organization.id,
      product_id: id,
      path,
      alt: product.id,
    });
    if (rowError) {
      await client.storage.from("catalog").remove([path]);
      return {
        error: "Image non enregistrée ; le fichier envoyé a été nettoyé.",
      };
    }
    revalidatePath("/app/catalogue");
    return { ok: true };
  } catch {
    return {
      error:
        "Image invalide : JPEG, PNG ou WebP, 5 Mo maximum et 20 mégapixels maximum.",
    };
  }
}
export async function removeProductImage(id: string) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const { data } = await client
    .from("product_images")
    .select("path")
    .eq("id", uuid.parse(id))
    .eq("organization_id", organization.id)
    .single();
  if (!data) return { error: "Image inaccessible." };
  const { error } = await client.storage.from("catalog").remove([data.path]);
  if (error) return { error: "Suppression du fichier impossible." };
  const { error: rowError } = await client
    .from("product_images")
    .delete()
    .eq("id", id)
    .eq("organization_id", organization.id);
  if (rowError) return { error: "Fichier supprimé ; référence à nettoyer." };
  revalidatePath("/app/catalogue");
  return { ok: true };
}
