import { billingUsageSchema, estimateUsageCost } from "@/domains/billing/usage";
import { tenant } from "@/domains/tenants/access";
import { PageHead, Notice } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { requestPlan } from "@/domains/billing/actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { client, organization, role } = await tenant();
  const { message } = await searchParams;
  if (!["owner", "admin"].includes(role))
    return (
      <>
        <PageHead
          title="Facturation"
          description="Contactez le propriétaire de votre boutique pour consulter les droits et quotas."
        />
      </>
    );
  const [
    { data: s, error },
    { data: plans, error: pe },
    { data: usage, error: ue },
    { count: productCount },
    { count: memberCount },
    { data: requests },
  ] = await Promise.all([
    client
      .from("subscriptions")
      .select("*")
      .eq("organization_id", organization.id)
      .single(),
    client.from("plan_entitlements").select("*").order("products_limit"),
    client.rpc("billing_usage", { _org: organization.id }),
    client
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id),
    client
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id),
    client
      .from("billing_requests")
      .select("plan,status,created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (error || pe || ue)
    throw new Error("Facturation indisponible. Vérifiez la migration 005.");
  const active =
    s.status === "trial"
      ? new Date(s.trial_ends_at) > new Date()
      : s.status === "manual" &&
        s.manual_until &&
        new Date(s.manual_until) > new Date();
  const totals = billingUsageSchema.parse(usage);
  const aiCalls = totals.ai_calls;
  const estimated = estimateUsageCost(
    totals,
    process.env.AI_INPUT_USD_PER_MILLION,
    process.env.AI_OUTPUT_USD_PER_MILLION,
  );
  return (
    <div className="stack">
      <PageHead
        title="Essai et facturation"
        description="Des limites visibles, sans paiement simulé ni prélèvement automatique."
      />
      <Notice message={message} />
      <div className="notice warning">
        <strong>Pilotage avec activation manuelle.</strong> Aucun prestataire de
        paiement n’est connecté. Les tarifs restent provisoires et aucune
        facture payée n’est inventée.
      </div>
      <section className="card">
        <div className="row between">
          <h2>Votre formule : {s.plan}</h2>
          <span className={`badge ${active ? "green" : "amber"}`}>
            {active
              ? s.status === "trial"
                ? "Essai en cours"
                : "Activation manuelle"
              : "Droits d’usage expirés"}
          </span>
        </div>
        <p>
          {s.status === "trial"
            ? "Fin de l’essai : " +
              new Date(s.trial_ends_at).toLocaleString("fr-MA", {
                timeZone: "Africa/Casablanca",
              })
            : "Fin d’activation : " +
              (s.manual_until
                ? new Date(s.manual_until).toLocaleString("fr-MA", {
                    timeZone: "Africa/Casablanca",
                  })
                : "—")}
        </p>
        <div className="grid cols3">
          <div>
            <strong>
              {aiCalls} / {s.ai_daily_limit}
            </strong>
            <p>Tentatives IA aujourd’hui (UTC)</p>
          </div>
          <div>
            <strong>{productCount ?? "—"}</strong>
            <p>Produits · consultez la limite de votre formule ci-dessous</p>
          </div>
          <div>
            <strong>{memberCount ?? "—"}</strong>
            <p>Membres de l’équipe</p>
          </div>
        </div>
        <p>
          Tokens enregistrés aujourd’hui :{" "}
          {totals.input_tokens + totals.output_tokens}. Les échecs sont aussi
          comptés comme tentatives ; les frais fournisseur peuvent différer de
          l’estimation.
        </p>
        <p>
          Messages sortants aujourd’hui : {totals.messages}. Coût IA estimé :{" "}
          {estimated === null
            ? "tarifs fournisseur non configurés"
            : estimated.toFixed(4) + " USD"}
          .
        </p>
        {requests?.[0]?.status === "pending" && (
          <span className="badge amber">
            Demande {requests[0].plan} en attente de traitement
          </span>
        )}
      </section>
      <div className="grid cols3">
        {plans?.map((p) => (
          <section className="card" key={p.plan}>
            <span className="eyebrow">{p.label}</span>
            <h2 style={{ marginTop: 16 }}>
              {p.price_mad_minor === null
                ? "Prix à définir"
                : (p.price_mad_minor / 100).toFixed(2) + " MAD · provisoire"}
            </h2>
            <p>
              {p.products_limit} produits
              <br />
              {p.members_limit} membres
              <br />
              {p.ai_daily_limit} tentatives IA / jour
              <br />
              {p.messages_daily_limit} messages sortants / jour
            </p>
            <form action={requestPlan}>
              <input type="hidden" name="plan" value={p.plan} />
              <PendingButton className="btn secondary">
                Demander l’activation
              </PendingButton>
            </form>
          </section>
        ))}
      </div>
      <small>
        L’activation d’une formule ne prouve aucun paiement. Le catalogue et les
        historiques restent consultables après expiration ; les usages IA et les
        envois sont bloqués sans droits actifs.
      </small>
    </div>
  );
}
