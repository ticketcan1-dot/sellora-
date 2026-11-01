"use server";
import { z } from "zod";
import { tenant } from "@/domains/tenants/access";
import { requirePlatformAdmin } from "@/domains/admin/access";
import { serviceDb } from "@/lib/supabase/server";
import { finish, dbMessage } from "@/lib/forms";
export async function requestPlan(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const { error } = await client.rpc("request_plan", {
    _org: organization.id,
    _plan: z.enum(["starter", "business", "premium"]).parse(form.get("plan")),
  });
  finish(
    "/app/facturation",
    error
      ? dbMessage(error.message)
      : "Demande transmise à l’administrateur. Aucun paiement n’a été prélevé.",
  );
}
export async function activatePlan(form: FormData) {
  const admin = await requirePlatformAdmin();
  const { error } = await serviceDb().rpc("admin_activate_plan", {
    _org: z.uuid().parse(form.get("organization_id")),
    _plan: z.enum(["starter", "business", "premium"]).parse(form.get("plan")),
    _days: z.coerce.number().int().min(0).max(365).parse(form.get("days")),
    _actor: admin.email,
  });
  finish(
    "/admin/abonnements",
    error
      ? dbMessage(error.message)
      : "Droits mis à jour manuellement, sans transaction de paiement.",
  );
}

export async function updatePlan(form: FormData) {
  const admin = await requirePlatformAdmin();
  const plan = z
    .enum(["starter", "business", "premium"])
    .parse(form.get("plan"));
  const details = z
    .object({
      products_limit: z.coerce.number().int().min(1).max(100000),
      members_limit: z.coerce.number().int().min(1).max(1000),
      ai_daily_limit: z.coerce.number().int().min(0).max(10000),
      messages_daily_limit: z.coerce.number().int().min(0).max(100000),
      price_mad_minor: z.number().int().nonnegative().nullable(),
    })
    .safeParse({
      ...Object.fromEntries(form),
      price_mad_minor: form.get("price")
        ? Math.round(Number(form.get("price")) * 100)
        : null,
    });
  if (!details.success)
    finish("/admin/abonnements", "Quotas ou tarif invalides.");
  const { error } = await serviceDb().rpc("admin_update_plan", {
    _plan: plan,
    _details: details.data,
    _actor: admin.email,
  });
  finish(
    "/admin/abonnements",
    error
      ? dbMessage(error.message)
      : "Formule et quotas mis à jour pour les boutiques concernées. Aucun paiement n’a été déclenché.",
  );
}
