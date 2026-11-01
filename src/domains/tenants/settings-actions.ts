"use server";
import {
  allCatalogPaths,
  incomingPaths,
  removeOwnedPaths,
} from "./storage-cleanup";
import { cookies } from "next/headers";
import { z } from "zod";
import { tenant } from "./access";
import { serviceDb } from "@/lib/supabase/server";
import { finish, dbMessage } from "@/lib/forms";
export async function updateShop(form: FormData) {
  const { client, organization, role } = await tenant(["owner", "admin"]);
  const { data: old } = await client
    .from("organizations")
    .select("is_active")
    .eq("id", organization.id)
    .single();
  const details = z
    .object({
      name: z.string().trim().min(2).max(100),
      contact_email: z.union([z.email(), z.literal("")]),
      city: z.string().max(100),
      retention_days: z.coerce.number().int().min(30).max(3650),
      low_stock_threshold: z.coerce.number().int().min(0).max(1000000),
      is_active: z.boolean(),
    })
    .safeParse({
      ...Object.fromEntries(form),
      is_active:
        role === "owner"
          ? form.get("is_active") === "on"
          : Boolean(old?.is_active),
    });
  if (!details.success)
    finish(
      "/app/parametres",
      "Vérifiez les paramètres et les longueurs des champs.",
    );
  const { error } = await client.rpc("update_shop", {
    _org: organization.id,
    _details: details.data,
  });
  finish(
    "/app/parametres",
    error ? dbMessage(error.message) : "Paramètres de la boutique enregistrés.",
  );
}
export async function applyRetention() {
  const { client, organization } = await tenant(["owner"]);
  const { data: settings } = await client
    .from("organizations")
    .select("retention_days")
    .eq("id", organization.id)
    .single();
  if (!settings)
    finish("/app/parametres", "Politique de conservation indisponible.");
  const cutoff = new Date(
    Date.now() - settings.retention_days * 86400000,
  ).toISOString();
  try {
    await removeOwnedPaths(
      serviceDb(),
      "simulation",
      organization.id,
      await incomingPaths(client, organization.id, cutoff),
    );
  } catch {
    finish(
      "/app/parametres",
      "Le nettoyage des images n’a pas pu être terminé. Réessayez avant d’effacer les références.",
    );
  }
  const { data, error } = await client.rpc("apply_retention", {
    _org: organization.id,
  });
  finish(
    "/app/parametres",
    error
      ? dbMessage(error.message)
      : `${data} message(s) ancien(s) de conversations closes ont été effacés. Les commandes comptables sont conservées.`,
  );
}
export async function deleteShop(form: FormData) {
  const { client, organization } = await tenant(["owner"]);
  if (
    form.get("confirmation") !== organization.name ||
    form.get("understood") !== "on"
  )
    finish(
      "/app/parametres",
      "La suppression exige le nom exact de la boutique et une confirmation explicite.",
    );
  try {
    const [catalog, media] = await Promise.all([
      allCatalogPaths(client, organization.id),
      incomingPaths(client, organization.id),
    ]);
    const admin = serviceDb();
    await removeOwnedPaths(admin, "catalog", organization.id, catalog);
    await removeOwnedPaths(admin, "simulation", organization.id, media);
  } catch {
    finish(
      "/app/parametres",
      "Nettoyage du stockage incomplet. La boutique a été conservée ; réessayez.",
    );
  }
  const { error: deleted } = await client.rpc("delete_shop", {
    _org: organization.id,
    _confirmation: organization.name,
  });
  if (deleted) finish("/app/parametres", dbMessage(deleted.message));
  (await cookies()).delete("sellora_org");
  finish(
    "/app/boutiques",
    "Boutique et données supprimées. Les accès locaux aux canaux ont été supprimés ; révoquez aussi Sellora dans les paramètres Meta.",
  );
}
