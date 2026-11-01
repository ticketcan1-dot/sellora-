import Link from "next/link";
import { requirePlatformAdmin } from "@/domains/admin/access";
import { serviceDb } from "@/lib/supabase/server";
import { activatePlan, updatePlan } from "@/domains/billing/actions";
import { Brand, Notice } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  await requirePlatformAdmin();
  const { message } = await searchParams;
  const client = serviceDb();
  const [{ data: subscriptions, error }, { data: requests, error: re }] =
    await Promise.all([
      client
        .from("subscriptions")
        .select("*,organizations(name)")
        .order("created_at", { ascending: false })
        .limit(100),
      client
        .from("billing_requests")
        .select("id,organization_id,plan,organizations(name)")
        .eq("status", "pending")
        .order("created_at")
        .limit(100),
    ]);
  if (error || re)
    throw new Error("Abonnements indisponibles. Vérifiez la migration 005.");
  const { data: plans } = await client
    .from("plan_entitlements")
    .select("*")
    .order("products_limit");
  return (
    <main className="public-section">
      <Brand />
      <div className="row between" style={{ marginTop: 30 }}>
        <h1>Activation manuelle des formules</h1>
        <Link href="/admin" className="btn secondary">
          Gérer les comptes
        </Link>
      </div>
      <Notice message={message} />
      <div className="notice warning">
        Aucun paiement en ligne. Une activation modifie uniquement les droits et
        quotas de la boutique, avec journal d’audit.
      </div>
      <section className="card">
        <h2>Demandes en attente</h2>
        {requests?.length ? (
          requests.map((r) => (
            <p key={r.id}>
              {(r.organizations as unknown as { name: string })?.name} ·{" "}
              {r.plan}
            </p>
          ))
        ) : (
          <p>Aucune demande.</p>
        )}
      </section>
      <details className="card" style={{ marginTop: 20 }}>
        <summary>Configurer les formules et leurs quotas</summary>
        <p>
          Ces limites s’appliquent à toutes les boutiques de la formule. Les
          tarifs sont provisoires et ne constituent pas un paiement en ligne.
        </p>
        {plans?.map((p) => (
          <form
            key={p.plan}
            action={updatePlan}
            style={{ padding: "20px 0", borderTop: "1px solid var(--border)" }}
          >
            <h3>{p.label}</h3>
            <input type="hidden" name="plan" value={p.plan} />
            <div className="grid cols3">
              <label>
                Produits
                <input
                  type="number"
                  name="products_limit"
                  min={1}
                  max={100000}
                  required
                  defaultValue={p.products_limit}
                />
              </label>
              <label>
                Membres
                <input
                  type="number"
                  name="members_limit"
                  min={1}
                  max={1000}
                  required
                  defaultValue={p.members_limit}
                />
              </label>
              <label>
                IA / jour
                <input
                  type="number"
                  name="ai_daily_limit"
                  min={0}
                  max={10000}
                  required
                  defaultValue={p.ai_daily_limit}
                />
              </label>
              <label>
                Messages / jour
                <input
                  type="number"
                  name="messages_daily_limit"
                  min={0}
                  max={100000}
                  required
                  defaultValue={p.messages_daily_limit}
                />
              </label>
              <label>
                Tarif MAD (facultatif)
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={
                    p.price_mad_minor === null ? "" : p.price_mad_minor / 100
                  }
                />
              </label>
            </div>
            <PendingButton className="btn secondary">
              Appliquer à cette formule
            </PendingButton>
          </form>
        ))}
      </details>
      {subscriptions?.map((s) => (
        <section
          className="card"
          key={s.organization_id}
          style={{ marginTop: 20 }}
        >
          <h2>{(s.organizations as unknown as { name: string })?.name}</h2>
          <p>
            {s.plan} · {s.status} · fin :{" "}
            {new Date(s.manual_until || s.trial_ends_at).toLocaleString(
              "fr-MA",
            )}
          </p>
          <form action={activatePlan} className="grid cols3">
            <input
              type="hidden"
              name="organization_id"
              value={s.organization_id}
            />
            <label>
              Formule
              <select name="plan" defaultValue={s.plan}>
                <option value="starter">Starter</option>
                <option value="business">Business</option>
                <option value="premium">Premium</option>
              </select>
            </label>
            <label>
              Durée (jours) · 0 pour désactiver
              <input
                type="number"
                name="days"
                min={0}
                max={365}
                defaultValue={30}
                required
              />
            </label>
            <div style={{ alignSelf: "center" }}>
              <PendingButton>Appliquer les droits</PendingButton>
            </div>
          </form>
        </section>
      ))}
    </main>
  );
}
