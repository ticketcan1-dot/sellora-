import { z } from "zod";
export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tone: z.enum(["chaleureux", "professionnel", "concis"]),
  address: z.enum(["vous", "tu"]),
  language: z.enum(["auto", "fr", "ar", "darija"]),
  emoji: z.boolean(),
  hours: z.string().max(1000),
  delivery: z.string().max(2000),
  returns: z.string().max(2000),
  cod: z.boolean(),
  discounts: z.string().max(1000),
  faq: z.string().max(4000),
  instructions: z.string().max(4000),
  escalation: z.string().min(1).max(1000),
  paused: z.boolean(),
  checkout_enabled: z.boolean().default(false),
  checkout_delivery_minor: z.number().int().min(0).max(10000000).default(0),
  checkout_cities: z
    .array(z.string().trim().min(2).max(100))
    .max(100)
    .default([]),
});
export type AiSettings = z.infer<typeof settingsSchema>;
export const interpretationSchema = z.object({
  language: z.enum(["fr", "ar", "darija"]),
  intent: z.enum([
    "product",
    "purchase",
    "delivery",
    "returns",
    "hours",
    "cod",
    "discount",
    "faq",
    "other",
  ]),
  product_ids: z.array(z.uuid()).max(3),
  ambiguous: z.boolean(),
  variant_id: z.uuid().nullable().default(null),
  quantity: z.number().int().min(1).max(100).default(1),
  faq_index: z.number().int().min(-1).max(100).default(-1),
});
export type Interpretation = z.infer<typeof interpretationSchema>;
