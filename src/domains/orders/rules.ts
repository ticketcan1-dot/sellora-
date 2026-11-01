import { z } from "zod";
export const orderStatuses = [
  "draft",
  "awaiting_confirmation",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export const orderLabels: Record<OrderStatus, string> = {
  draft: "Brouillon",
  awaiting_confirmation: "À confirmer par le client",
  confirmed: "Confirmée",
  processing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};
export const transitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ["awaiting_confirmation", "cancelled"],
  awaiting_confirmation: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};
export const orderInput = z.object({
  customer: z.uuid(),
  conversation: z.uuid().nullable(),
  items: z
    .array(
      z.object({
        variant_id: z.uuid(),
        quantity: z.number().int().min(1).max(10000),
      }),
    )
    .min(1)
    .max(50),
  delivery: z.number().int().min(0).max(10000000),
  notes: z.string().max(4000),
});
