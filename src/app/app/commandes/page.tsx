import { cookies } from "next/headers";
import Link from "next/link";
import { z } from "zod";
import { tenant } from "@/domains/tenants/access";
import { PageHead, Notice, Empty } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { OrderForm } from "@/domains/orders/order-form";
import {
  orderStatuses,
  orderLabels,
  transitions,
  type OrderStatus,
} from "@/domains/orders/rules";
import { transitionOrder, recordPayment } from "@/domains/orders/actions";
import { formatMad } from "@/domains/catalog/schema";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    message?: string;
    id?: string;
    status?: string;
    source?: string;
    page?: string;
    conversation?: string;
  }>;
}) {
  const { client, organization, role } = await tenant();
  const params = await searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .catch(1)
    .parse(params.page || 1);
  const status = z.enum(orderStatuses).safeParse(params.status);
  let query = client
    .from("orders")
    .select(
      "id,status,total_minor,is_simulation,source,created_at,paid_at,customers(name)",
      { count: "exact" },
    )
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * 50, page * 50 - 1);
  if (status.success) query = query.eq("status", status.data);
  if (params.source === "simulation") query = query.eq("is_simulation", true);
  if (params.source === "real") query = query.eq("is_simulation", false);
  const [
    { data: orders, error, count },
    { data: customers, error: ce },
    { data: variants, error: ve },
  ] = await Promise.all([
    query,
    client
      .from("customers")
      .select("id,name")
      .eq("organization_id", organization.id)
      .order("name")
      .limit(1000),
    client
      .from("product_variants")
      .select("id,name,price_minor,stock,products!inner(name,status)")
      .eq("organization_id", organization.id)
      .eq("products.status", "active")
      .order("sku")
      .limit(1000),
  ]);
  if (error || ce || ve)
    throw new Error("Commandes indisponibles. Vérifiez la migration 004.");
  let selected = null;
  if (params.id && z.uuid().safeParse(params.id).success) {
    const r = await client
      .from("orders")
      .select("*,order_items(*),order_history(*),payment_records(*)")
      .eq("organization_id", organization.id)
      .eq("id", params.id)
      .single();
    if (!r.error) selected = r.data;
  }
  const checkoutLink = (await cookies()).get("sellora_checkout_link")?.value;
  const canEdit = role !== "viewer";
  const manager = ["owner", "admin"].includes(role);
  const variantOptions = (variants || []).map((v) => ({
    ...v,
    productName: (
      (Array.isArray(v.products) ? v.products[0] : v.products) as unknown as {
        name: string;
      }
    ).name,
  }));
  const paid =
    selected?.payment_records.reduce(
      (s: number, p: { amount_minor: number }) => s + p.amount_minor,
      0,
    ) || 0;
  return (
    <div className="stack">
      <PageHead
        title="Vos commandes"
        description="Du récapitulatif client à la livraison, avec stock contrôlé et historique."
      />
      <Notice message={params.message} />
      {checkoutLink && canEdit && (
        <section className="card">
          <h2>Lien de confirmation client</h2>
          <label>
            Copier et partager uniquement avec le client
            <input readOnly value={checkoutLink} />
          </label>
          <p>
            Le lien est valable 24 heures ; cette copie est visible pendant cinq
            minutes dans ce navigateur. Aucun message n’est envoyé
            automatiquement.
          </p>
        </section>
      )}
      {canEdit && (
        <OrderForm
          customers={customers || []}
          variants={variantOptions}
          conversation={
            params.conversation &&
            z.uuid().safeParse(params.conversation).success
              ? params.conversation
              : undefined
          }
        />
      )}
      <section className="card">
        <form className="row" method="get">
          <label>
            Statut
            <select name="status" defaultValue={params.status || ""}>
              <option value="">Tous</option>
              {orderStatuses.map((s) => (
                <option value={s} key={s}>
                  {orderLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origine
            <select name="source" defaultValue={params.source || "real"}>
              <option value="real">Commandes réelles</option>
              <option value="simulation">Simulations</option>
              <option value="all">Toutes</option>
            </select>
          </label>
          <button className="btn secondary">Filtrer</button>
        </form>
        {orders?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Commande</th>
                  <th>Client</th>
                  <th>Statut</th>
                  <th>Total</th>
                  <th>Origine</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const c = (Array.isArray(o.customers)
                    ? o.customers[0]
                    : o.customers) as unknown as { name: string } | null;
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link href={"?id=" + o.id}>
                          <strong>#{o.id.slice(0, 8)}</strong>
                        </Link>
                        <br />
                        <small>
                          {new Date(o.created_at).toLocaleDateString("fr-MA", {
                            timeZone: "Africa/Casablanca",
                          })}
                        </small>
                      </td>
                      <td>{c?.name || "Client supprimé"}</td>
                      <td>
                        <span className="badge">
                          {orderLabels[o.status as OrderStatus]}
                        </span>
                      </td>
                      <td>
                        {formatMad(o.total_minor)}
                        <br />
                        <small>
                          {o.paid_at ? "Encaissement enregistré" : "Non soldée"}
                        </small>
                      </td>
                      <td>{o.is_simulation ? "SIMULATION" : o.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Aucune commande">
            Les commandes apparaissent après création d’un brouillon, avec un
            vrai client et des produits du catalogue.
          </Empty>
        )}
        <div className="row" style={{ marginTop: 16 }}>
          {page > 1 && (
            <Link
              className="btn secondary small"
              href={
                "?" +
                new URLSearchParams({
                  status: params.status || "",
                  source: params.source || "real",
                  page: String(page - 1),
                })
              }
            >
              Précédent
            </Link>
          )}
          {page * 50 < (count || 0) && (
            <Link
              className="btn secondary small"
              href={
                "?" +
                new URLSearchParams({
                  status: params.status || "",
                  source: params.source || "real",
                  page: String(page + 1),
                })
              }
            >
              Suivant
            </Link>
          )}
        </div>
      </section>
      {selected && (
        <section className="card">
          <div className="row between">
            <h2>Commande #{selected.id.slice(0, 8)}</h2>
            <Link
              className="btn secondary small"
              href={"/app/commandes/" + selected.id + "/document"}
            >
              Document imprimable
            </Link>
            <span
              className={`badge ${selected.is_simulation ? "amber" : "green"}`}
            >
              {selected.is_simulation ? "SIMULATION" : "Commande réelle"}
            </span>
          </div>
          <p>
            {orderLabels[selected.status as OrderStatus]} ·{" "}
            {formatMad(selected.total_minor)} · Livraison{" "}
            {formatMad(selected.delivery_minor)}
          </p>
          <p>
            {selected.customer_snapshot.name} ·{" "}
            {selected.customer_snapshot.phone}
            <br />
            {selected.customer_snapshot.city} ·{" "}
            {selected.customer_snapshot.address}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Quantité</th>
                  <th>Prix figé</th>
                </tr>
              </thead>
              <tbody>
                {selected.order_items.map(
                  (item: {
                    id: string;
                    product_name: string;
                    variant_name: string;
                    quantity: number;
                    unit_price_minor: number;
                  }) => (
                    <tr key={item.id}>
                      <td>
                        {item.product_name} · {item.variant_name}
                      </td>
                      <td>{item.quantity}</td>
                      <td>{formatMad(item.unit_price_minor)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {selected.notes && (
            <p style={{ marginTop: 18 }}>Notes : {selected.notes}</p>
          )}
          {canEdit &&
            transitions[selected.status as OrderStatus].length > 0 && (
              <form action={transitionOrder} style={{ marginTop: 20 }}>
                <input type="hidden" name="id" value={selected.id} />
                <label>
                  Faire évoluer la commande
                  <select name="status" required>
                    {transitions[selected.status as OrderStatus].map((s) => (
                      <option key={s} value={s}>
                        {orderLabels[s]}
                      </option>
                    ))}
                  </select>
                </label>
                {selected.status === "awaiting_confirmation" && (
                  <>
                    <label>
                      Référence de la confirmation client
                      <textarea
                        name="evidence"
                        maxLength={2000}
                        placeholder="Référence du message, accord sur produits, variantes, total et livraison…"
                      />
                    </label>
                    <label>
                      <input name="customer_confirmed" type="checkbox" />
                      Le client a explicitement accepté le récapitulatif et le
                      montant total.
                    </label>
                  </>
                )}
                <PendingButton>Appliquer le statut</PendingButton>
              </form>
            )}
          {manager &&
            !selected.is_simulation &&
            ["confirmed", "processing", "shipped", "delivered"].includes(
              selected.status,
            ) &&
            paid < selected.total_minor && (
              <details style={{ marginTop: 24 }}>
                <summary>Enregistrer un encaissement reçu</summary>
                <div className="notice warning">
                  Saisie manuelle justifiée. Aucun paiement en ligne ni contrôle
                  bancaire automatique n’est déclenché.
                </div>
                <form action={recordPayment}>
                  <input type="hidden" name="id" value={selected.id} />
                  <label>
                    Montant reçu (MAD) · reste{" "}
                    {formatMad(selected.total_minor - paid)}
                    <input
                      name="amount"
                      inputMode="decimal"
                      required
                      pattern="[0-9]+([.,][0-9]{1,2})?"
                    />
                  </label>
                  <label>
                    Mode
                    <select name="method">
                      <option value="cod">
                        Paiement à la livraison encaissé
                      </option>
                      <option value="bank">Virement reçu</option>
                      <option value="manual">
                        Autre encaissement documenté
                      </option>
                    </select>
                  </label>
                  <label>
                    Référence du reçu ou de la preuve
                    <input
                      name="reference"
                      minLength={3}
                      maxLength={200}
                      required
                    />
                  </label>
                  <label>
                    <input name="received" type="checkbox" required />
                    J’atteste que cet encaissement a réellement été reçu.
                  </label>
                  <PendingButton>Enregistrer l’encaissement</PendingButton>
                </form>
              </details>
            )}
          <h3 style={{ marginTop: 24 }}>Historique</h3>
          {[...selected.order_history]
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map(
              (h: {
                id: string;
                next_status: OrderStatus;
                created_at: string;
                note: string;
              }) => (
                <p key={h.id}>
                  <span className="badge">{orderLabels[h.next_status]}</span>{" "}
                  {new Date(h.created_at).toLocaleString("fr-MA", {
                    timeZone: "Africa/Casablanca",
                  })}
                  {h.note && (
                    <>
                      <br />
                      {h.note}
                    </>
                  )}
                </p>
              ),
            )}
          {selected.payment_records.length > 0 && (
            <>
              <h3>Encaissements enregistrés</h3>
              {selected.payment_records.map(
                (p: {
                  id: string;
                  amount_minor: number;
                  reference: string;
                  provider_verified: boolean;
                }) => (
                  <p key={p.id}>
                    {formatMad(p.amount_minor)} · {p.reference} ·{" "}
                    {p.provider_verified
                      ? "Vérifié par le prestataire"
                      : "Déclaration manuelle documentée"}
                  </p>
                ),
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
