import type { Product } from "@/domains/catalog/schema";
import type { AiSettings } from "./schema";
export function boundedModelContext(input: {
  message: string;
  history: { role: string; content: string }[];
  products: Product[];
  settings: AiSettings;
}) {
  const context = {
    message: input.message.slice(0, 3000),
    history: input.history
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) })),
    catalog: [] as Record<string, unknown>[],
    faq: input.settings.faq
      .split("\n")
      .filter(Boolean)
      .slice(0, 32)
      .map((x) => x.slice(0, 500)),
    style_preferences: {
      tone: input.settings.tone,
      language: input.settings.language,
      instructions: input.settings.instructions.slice(0, 2000),
    },
    partial_catalog: false,
  };
  let size = JSON.stringify(context).length;
  for (const p of input.products) {
    const row = {
      id: p.id,
      name: p.name.slice(0, 160),
      description_fr: (p.description_fr || "").slice(0, 400),
      description_ar: (p.description_ar || "").slice(0, 400),
      category: (p.category || "").slice(0, 100),
      tags: (p.tags || []).slice(0, 8),
      visual_attributes: (p.visual_attributes || "").slice(0, 300),
      variants: p.product_variants.slice(0, 20).map((v) => ({
        id: v.id,
        name: v.name,
        color: v.color,
        size: v.size,
        material: v.material,
      })),
    };
    const length = JSON.stringify(row).length + 1;
    if (size + length > 60000) {
      context.partial_catalog = true;
      break;
    }
    context.catalog.push(row);
    size += length;
  }
  return context;
}
