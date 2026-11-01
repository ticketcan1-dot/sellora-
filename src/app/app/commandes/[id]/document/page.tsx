import { notFound } from "next/navigation";
import { z } from "zod";
import { tenant } from "@/domains/tenants/access";
import { PrintButton } from "@/domains/orders/print-button";
import { formatMad } from "@/domains/catalog/schema";
import { orderLabels, type OrderStatus } from "@/domains/orders/rules";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client, organization } = await tenant();
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { data: order, error } = await client
    .from("orders")
    .select("*,order_items(*),payment_records(*)")
    .eq("organization_id", organization.id)
    .eq("id", parsed.data)
    .single();
  if (error) notFound();
  return (
    <section className="card">
      <div className="row between">
        <div>
          <span className="eyebrow">{organization.name}</span>
          <h1 style={{ marginTop: 12 }}>Récapitulatif de commande</h1>
        </div>
        <PrintButton />
      </div>
      {order.is_simulation && (
        <div className="notice warning">
          SIMULATION — document de test, sans vente réelle.
        </div>
      )}
      <p>
        Référence : {order.id}
        <br />
        Date :{" "}
        {new Date(order.created_at).toLocaleString("fr-MA", {
          timeZone: "Africa/Casablanca",
        })}
        <br />
        Statut : {orderLabels[order.status as OrderStatus]}
      </p>
      <h2>Coordonnées de livraison</h2>
      <p>
        {order.customer_snapshot.name || "Client anonymisé"}
        <br />
        {order.customer_snapshot.phone}
        <br />
        {order.customer_snapshot.city}
        <br />
        {order.customer_snapshot.address}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Variante</th>
              <th>Quantité</th>
              <th>Prix unitaire figé</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.order_items.map(
              (i: {
                id: string;
                product_name: string;
                variant_name: string;
                quantity: number;
                unit_price_minor: number;
              }) => (
                <tr key={i.id}>
                  <td>{i.product_name}</td>
                  <td>{i.variant_name}</td>
                  <td>{i.quantity}</td>
                  <td>{formatMad(i.unit_price_minor)}</td>
                  <td>{formatMad(i.quantity * i.unit_price_minor)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 24 }}>
        Livraison : {formatMad(order.delivery_minor)}
      </p>
      <h2>Total : {formatMad(order.total_minor)}</h2>
      <p>
        {order.paid_at
          ? "Encaissement intégral enregistré"
          : "Commande non soldée"}
        .
      </p>
      {order.payment_records.map(
        (p: {
          id: string;
          amount_minor: number;
          method: string;
          reference: string;
          provider_verified: boolean;
        }) => (
          <p key={p.id}>
            {formatMad(p.amount_minor)} · {p.method} · référence {p.reference} ·{" "}
            {p.provider_verified
              ? "Vérifié par le prestataire"
              : "Déclaration manuelle documentée"}
          </p>
        ),
      )}
      <p>
        Ce récapitulatif ne constitue pas une facture fiscale ni une preuve de
        paiement bancaire automatique.
      </p>
    </section>
  );
}
