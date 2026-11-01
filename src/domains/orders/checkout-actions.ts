"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { serviceDb } from "@/lib/supabase/server";
import { finish } from "@/lib/forms";
export async function completeCheckout(form: FormData) {
  const token = z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .parse(form.get("token"));
  const details = z
    .object({
      name: z.string().trim().min(2).max(160),
      phone: z.string().trim().min(6).max(40),
      city: z.string().trim().min(2).max(100),
      address: z.string().trim().min(5).max(1000),
      consent: z.literal(true),
      agreed: z.literal(true),
      whatsapp_opt_in: z.boolean(),
    })
    .safeParse({
      ...Object.fromEntries(form),
      consent: form.get("consent") === "on",
      agreed: form.get("agreed") === "on",
      whatsapp_opt_in: form.get("whatsapp_opt_in") === "on",
    });
  if (!details.success)
    finish(
      "/commande/" + token,
      "Vérifiez vos coordonnées et confirmez votre accord sur le récapitulatif.",
    );
  const { error } = await serviceDb().rpc("complete_checkout", {
    _hash: createHash("sha256").update(token).digest("hex"),
    _details: details.data,
  });
  if (error)
    finish(
      "/commande/" + token,
      error.message.includes("Insufficient stock")
        ? "Le stock a changé. Contactez la boutique avant de confirmer."
        : error.message.includes("Price changed") ||
            error.message.includes("Checkout policy changed")
          ? "Le prix a changé. Demandez un nouveau récapitulatif à la boutique."
          : "Ce lien ne permet plus de confirmer la commande. Contactez la boutique.",
    );
  finish(
    "/commande/" + token,
    "Votre commande a été confirmée. Aucun paiement en ligne n’a été prélevé.",
  );
}
