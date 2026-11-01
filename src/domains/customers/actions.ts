"use server";
import { z } from "zod";
import { tenant } from "@/domains/tenants/access";
import { finish, dbMessage } from "@/lib/forms";
export async function saveCustomer(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin", "agent"]);
  const details = z
    .object({
      name: z.string().trim().min(2).max(160),
      phone: z.string().max(40),
      city: z.string().max(100),
      address: z.string().max(1000),
      notes: z.string().max(4000),
      consent: z.literal(true),
      whatsapp_opt_in: z.boolean(),
    })
    .safeParse({
      ...Object.fromEntries(form),
      consent: form.get("consent") === "on",
      whatsapp_opt_in: form.get("whatsapp_opt_in") === "on",
    });
  if (!details.success)
    finish(
      "/app/clients",
      "Vérifiez les champs et confirmez le consentement du client.",
    );
  const id = form.get("id") ? z.uuid().parse(form.get("id")) : null;
  const { data, error } = await client.rpc("save_customer", {
    _org: organization.id,
    _id: id,
    _details: details.data,
  });
  if (error) finish("/app/clients", dbMessage(error.message));
  finish("/app/clients?id=" + data, "Fiche client enregistrée.");
}

export async function anonymizeCustomer(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin"]);
  if (form.get("confirm") !== "on")
    finish("/app/clients", "Confirmez l’effacement des coordonnées.");
  const { error } = await client.rpc("anonymize_customer", {
    _org: organization.id,
    _customer: z.uuid().parse(form.get("id")),
  });
  finish(
    "/app/clients",
    error
      ? "Anonymisation bloquée : vérifiez les commandes encore ouvertes."
      : "Coordonnées et récapitulatifs de ce client anonymisés. Les textes de conversation restent soumis à la politique de conservation.",
  );
}
