"use server";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { appUrl } from "@/lib/config";
import { z } from "zod";
import { tenant } from "@/domains/tenants/access";
import { finish, dbMessage } from "@/lib/forms";
import { orderInput, orderStatuses } from "./rules";
import { parseMad } from "@/domains/catalog/schema";
export async function createOrder(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin", "agent"]);
  if (form.get("create_mode") === "link") {
    let items;
    let delivery;
    try {
      items = orderInput.shape.items.parse(
        JSON.parse(String(form.get("items"))),
      );
      delivery = parseMad(String(form.get("delivery")));
    } catch {
      finish("/app/commandes", "Vérifiez les produits et la livraison.");
    }
    const token = randomBytes(32).toString("base64url");
    const { error } = await client.rpc("create_checkout_link", {
      _org: organization.id,
      _conversation: form.get("conversation")
        ? z.uuid().parse(form.get("conversation"))
        : null,
      _items: items,
      _delivery: delivery,
      _hash: createHash("sha256").update(token).digest("hex"),
    });
    if (error) finish("/app/commandes", dbMessage(error.message));
    (await cookies()).set(
      "sellora_checkout_link",
      appUrl() + "/commande/" + token,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/app/commandes",
        maxAge: 300,
      },
    );
    finish(
      "/app/commandes",
      "Lien privé créé pour 24 heures. Le client devra confirmer lui-même les coordonnées, produits et montant.",
    );
  }
  let parsed;
  try {
    parsed = orderInput.safeParse({
      customer: form.get("customer"),
      conversation: form.get("conversation") || null,
      items: JSON.parse(String(form.get("items"))),
      delivery: parseMad(String(form.get("delivery"))),
      notes: form.get("notes") || "",
    });
  } catch {
    finish(
      "/app/commandes",
      "Vérifiez les produits, quantités et frais de livraison.",
    );
  }
  if (!parsed.success)
    finish(
      "/app/commandes",
      "Vérifiez le client, les produits et les quantités.",
    );
  const p = parsed.data;
  const { data, error } = await client.rpc("create_order", {
    _org: organization.id,
    _customer: p.customer,
    _conversation: p.conversation,
    _items: p.items,
    _delivery: p.delivery,
    _notes: p.notes,
  });
  if (error) finish("/app/commandes", dbMessage(error.message));
  finish(
    "/app/commandes?id=" + data,
    "Brouillon créé. Les prix ont été figés depuis le catalogue ; le stock sera réservé à la confirmation.",
  );
}
export async function transitionOrder(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin", "agent"]);
  const id = z.uuid().parse(form.get("id"));
  const status = z.enum(orderStatuses).parse(form.get("status"));
  if (status === "confirmed" && form.get("customer_confirmed") !== "on")
    finish(
      "/app/commandes?id=" + id,
      "Confirmez que le client a explicitement accepté le récapitulatif.",
    );
  const evidence = z
    .string()
    .max(2000)
    .parse(form.get("evidence") || "");
  const { error } = await client.rpc("transition_order", {
    _org: organization.id,
    _order: id,
    _status: status,
    _evidence: evidence,
  });
  finish(
    "/app/commandes?id=" + id,
    error ? dbMessage(error.message) : "Statut de la commande mis à jour.",
  );
}
export async function recordPayment(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const id = z.uuid().parse(form.get("id"));
  if (form.get("received") !== "on")
    finish(
      "/app/commandes?id=" + id,
      "Attestez que l’encaissement a réellement été reçu.",
    );
  let amount;
  try {
    amount = parseMad(String(form.get("amount")));
  } catch {
    finish("/app/commandes?id=" + id, "Montant invalide.");
  }
  const method = z.enum(["cod", "bank", "manual"]).parse(form.get("method"));
  const reference = z
    .string()
    .trim()
    .min(3)
    .max(200)
    .safeParse(form.get("reference"));
  if (!reference.success)
    finish("/app/commandes?id=" + id, "Une référence de preuve est requise.");
  const { error } = await client.rpc("record_payment", {
    _org: organization.id,
    _order: id,
    _amount: amount,
    _method: method,
    _reference: reference.data,
  });
  finish(
    "/app/commandes?id=" + id,
    error
      ? dbMessage(error.message)
      : "Encaissement enregistré manuellement et journalisé. Il ne constitue pas une vérification automatique par une banque.",
  );
}
