import Papa from "papaparse";
import { parseMad, productSchema, type ProductInput } from "./schema";
export const csvFields = [
  "name",
  "sku",
  "price",
  "stock",
  "category",
  "description_fr",
  "color",
  "size",
  "material",
] as const;
export type CsvMapping = Record<string, string>;
export function parseCsv(text: string) {
  return Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
}
export function validateCsv(
  rows: Record<string, string>[],
  mapping: CsvMapping,
) {
  const accepted: { row: number; product: ProductInput }[] = [];
  const errors: { row: number; message: string }[] = [];
  const skus = new Set<string>();
  rows.forEach((row, index) => {
    try {
      const get = (key: string) => row[mapping[key]]?.trim() || "";
      const sku = get("sku");
      if (skus.has(sku)) throw new Error("SKU dupliqué dans le fichier");
      const product = productSchema.parse({
        name: get("name"),
        category: get("category"),
        description_fr: get("description_fr"),
        variants: [
          {
            sku,
            name: "Standard",
            price_minor: parseMad(get("price")),
            stock: /^\d+$/.test(get("stock")) ? Number(get("stock")) : NaN,
            color: get("color"),
            size: get("size"),
            material: get("material"),
          },
        ],
      });
      skus.add(sku);
      accepted.push({ row: index + 2, product });
    } catch (e) {
      errors.push({
        row: index + 2,
        message: e instanceof Error ? e.message : "Ligne invalide",
      });
    }
  });
  return { accepted, errors };
}
