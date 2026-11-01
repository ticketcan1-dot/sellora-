import { z } from "zod";
export const variantSchema = z.object({
  id: z.uuid().optional(),
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(100),
  color: z.string().max(80).default(""),
  size: z.string().max(80).default(""),
  material: z.string().max(80).default(""),
  price_minor: z.number().int().min(0).max(100000000),
  stock: z.number().int().min(0).max(1000000),
});
export const productSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    description_fr: z.string().max(4000).default(""),
    description_ar: z.string().max(4000).default(""),
    category: z.string().max(100).default(""),
    status: z.enum(["active", "inactive"]).default("active"),
    tags: z.array(z.string().max(50)).max(30).default([]),
    visual_attributes: z.string().max(1000).default(""),
    delivery_rules: z.string().max(1000).default(""),
    variants: z.array(variantSchema).min(1).max(100),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.variants.map((v) => v.sku)).size !== p.variants.length)
      ctx.addIssue({
        code: "custom",
        message: "Chaque variante doit avoir un SKU différent.",
        path: ["variants"],
      });
  });
export type ProductInput = z.infer<typeof productSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type Product = Omit<ProductInput, "variants"> & {
  id: string;
  product_variants: Variant[];
  product_images: { id: string; path: string; alt: string; url?: string }[];
};
export function parseMad(value: string): number {
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(value.trim()))
    throw new Error("Prix MAD invalide");
  const [whole, decimal = ""] = value.trim().replace(",", ".").split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
export function formatMad(value: number) {
  return new Intl.NumberFormat("fr-MA", {
    style: "currency",
    currency: "MAD",
  }).format(value / 100);
}
