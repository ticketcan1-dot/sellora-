import Link from "next/link";
import {
  Package,
  MessagesSquare,
  ShoppingBag,
  Wallet,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Check,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { tenant } from "@/domains/tenants/access";
import { onboarding } from "@/domains/tenants/actions";
import { ShopSwitcher } from "@/domains/tenants/shop-switcher";
import { PageHead, Empty, Notice } from "@/components/ui";
import { formatMad } from "@/domains/catalog/schema";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { client, organization: o, memberships, role } = await tenant();
  const [{ data: m, error: metricError }, { data: lowRows, error: lowError }] =
    await Promise.all([
      client.rpc("dashboard_metrics", { org: o.id }),
      client
        .from("product_variants")
        .select("id,sku,stock,products!inner(name,status)")
        .eq("organization_id", o.id)
        .eq("products.status", "active")
        .lte("stock", o.low_stock_threshold)
        .order("stock")
        .limit(10),
    ]);
  if (metricError || lowError || !m)
    throw new Error("Impossible de calculer le tableau de bord.");
  const products = { count: m.active_products };
  const convos = { count: m.conversations };
  const inStock = { count: m.in_stock };
  const low = { data: lowRows };
  const confirmed = { length: m.confirmed_orders };
  const confirmedTotal = m.confirmed_total;
  const paid = m.paid_total;
  const conversions = m.converted_conversations;
  const metrics = [
    [
      "Produits actifs",
      String(products.count || 0),
      Package,
      "Votre catalogue disponible",
    ],
    [
      "Conversations réelles",
      String(convos.count || 0),
      MessagesSquare,
      "Simulations exclues",
    ],
    [
      "Commandes confirmées",
      String(confirmed.length),
      ShoppingBag,
      "Hors brouillons et annulations",
    ],
    [
      "Montant confirmé",
      formatMad(confirmedTotal),
      Wallet,
      "Total commandé · pas nécessairement réglé",
    ],
  ] as const;
  const { message } = await searchParams;
  return (
    <>
      <PageHead
        title={`Bonjour, ${o.name} 👋`}
        description="Une vue claire sur votre activité. Un pas de plus pour votre commerce."
      >
        <ShopSwitcher memberships={memberships} selected={o.id} />
      </PageHead>
      <Notice message={message} />
      <div className="grid cols4" style={{ marginBottom: 24 }}>
        {metrics.map(([label, value, Icon, note]) => (
          <section className="card" key={label}>
            <div className="metric-top">
              <span>{label}</span>
              <span className="metric-icon">
                <Icon size={18} />
              </span>
            </div>
            <div className="metric-value">{value}</div>
            <div className="metric-note">{note}</div>
          </section>
        ))}
      </div>
      {!o.onboarding_completed && (
        <section className="card onboarding" style={{ marginBottom: 24 }}>
          <div className="row between">
            <div>
              <span className="eyebrow">BIENVENUE CHEZ SELLORA</span>
              <h2 style={{ marginTop: 8 }}>
                Faisons grandir votre boutique, étape par étape.
              </h2>
              <p style={{ marginBottom: 0 }}>
                Votre progression est sauvegardée. Les canaux restent
                optionnels.
              </p>
            </div>
            <span className="badge">Étape {o.onboarding_step} / 4</span>
          </div>
          <div className="grid cols4" style={{ marginTop: 18 }}>
            {[
              ["Boutique créée", "/app/boutiques"],
              ["Ajouter le catalogue", "/app/catalogue"],
              ["Tester l’assistant", "/app/assistant"],
              ["Découvrir les canaux", "/app/canaux"],
            ].map(([title, href], i) => (
              <Link href={href} className="step" key={title}>
                <span className="step-number">
                  {i === 0 ? <Check size={14} /> : i + 1}
                </span>
                {title}
                <ArrowUpRight size={13} />
              </Link>
            ))}
          </div>
          {["owner", "admin"].includes(role) && (
            <form action={onboarding} className="row" style={{ marginTop: 12 }}>
              <input
                type="hidden"
                name="step"
                value={Math.min(4, o.onboarding_step + 1)}
              />
              {o.onboarding_step === 4 && (
                <input type="hidden" name="complete" value="true" />
              )}
              <button className="btn secondary small">
                {o.onboarding_step === 4
                  ? "Terminer · canaux ignorés"
                  : "Étape consultée · continuer"}
              </button>
            </form>
          )}
        </section>
      )}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))",
        }}
      >
        <section className="card">
          <div className="row between">
            <h2>Votre activité réelle</h2>
            <span className="badge">Depuis la création</span>
          </div>
          <div className="chart-empty">
            {!convos.count && !confirmed.length
              ? "Vos premiers échanges et commandes apparaîtront ici."
              : `${convos.count} conversations · ${confirmed.length} commandes confirmées`}
          </div>
          <div className="row between" style={{ paddingTop: 18 }}>
            <div>
              <small>Montant réglé vérifié</small>
              <h3 style={{ margin: 0 }}>{formatMad(paid)}</h3>
            </div>
            <div>
              <small>Conversion des conversations</small>
              <h3 style={{ margin: 0 }}>
                {convos.count
                  ? `${((conversions / convos.count) * 100).toFixed(1)} %`
                  : "—"}
              </h3>
            </div>
          </div>
          <small>
            Conversations réelles ayant une commande confirmée / conversations
            réelles. Les paiements ne sont pas encore intégrés.
          </small>
        </section>
        <section className="card">
          <div className="row between">
            <h2>À surveiller</h2>
            <AlertTriangle size={18} color="#b28335" />
          </div>
          {low.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Produit / SKU</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {low.data.map((v) => {
                    const p = (Array.isArray(v.products)
                      ? v.products[0]
                      : v.products) as unknown as { name: string };
                    return (
                      <tr key={v.id}>
                        <td>
                          {p.name}
                          <br />
                          <small>{v.sku}</small>
                        </td>
                        <td>
                          <span className="badge amber">{v.stock}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Aucune alerte de stock">
              Les variantes actives avec un stock inférieur ou égal à{" "}
              {o.low_stock_threshold} seront listées ici.
            </Empty>
          )}
          <small>
            {inStock.count || 0} variante(s) avec du stock · jusqu’à 10 alertes
            affichées.
          </small>
        </section>
      </div>
      <section className="card row between" style={{ marginTop: 24 }}>
        <div className="row">
          <span className="metric-icon">
            <Sparkles size={22} />
          </span>
          <div>
            <h2 style={{ margin: 0 }}>Votre assistant a votre personnalité.</h2>
            <small>
              Réglez son ton, puis testez un premier échange en darija.
            </small>
          </div>
        </div>
        <Link href="/app/assistant" className="btn secondary">
          Personnaliser <ArrowRight size={15} />
        </Link>
      </section>
      <div className="row" style={{ marginTop: 24 }}>
        <Link href="/app/catalogue" className="btn">
          <Plus size={16} />
          Gérer mes produits
        </Link>
        <span className="muted" style={{ fontSize: 12 }}>
          Chiffres issus de votre base · aucune donnée fictive
        </span>
      </div>
    </>
  );
}
