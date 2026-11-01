import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { z } from "zod";
import { serviceDb } from "@/lib/supabase/server";
import { Brand, Notice } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { formatMad } from "@/domains/catalog/schema";
import { completeCheckout } from "@/domains/orders/checkout-actions";
import { orderLabels, type OrderStatus } from "@/domains/orders/rules";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Confirmer votre commande",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
const preview = z.object({
  shop: z.string(),
  completed: z.boolean(),
  is_simulation: z.boolean(),
  total_minor: z.number(),
  order_id: z.string().optional(),
  status: z.string().optional(),
  delivery_minor: z.number().optional(),
  delivery_cities: z.array(z.string()).optional(),
  expires_at: z.string().optional(),
  items: z
    .array(
      z.object({
        product_name: z.string(),
        variant_name: z.string(),
        quantity: z.number(),
        unit_price_minor: z.number(),
      }),
    )
    .optional(),
});
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  const { message } = await searchParams;
  const { data, error } = await serviceDb().rpc("checkout_preview", {
    _hash: createHash("sha256").update(token).digest("hex"),
  });
  if (error || !data)
    return (
      <main className="legal">
        <Brand />
        <section className="card" style={{ marginTop: 30 }}>
          <h1>Lien indisponible ou expiré</h1>
          <p>
            Demandez un nouveau récapitulatif à votre boutique. Aucune nouvelle
            commande n’a été créée.
          </p>
        </section>
      </main>
    );
  const p = preview.parse(data);
  return (
    <main className="legal">
      <Brand />
      <section className="card" style={{ marginTop: 30 }}>
        <span className="eyebrow">{p.shop}</span>
        {p.is_simulation && (
          <div className="notice warning" style={{ marginTop: 16 }}>
            SIMULATION — aucun achat réel, aucun stock réservé, aucune
            statistique commerciale.
          </div>
        )}
        <h1 style={{ marginTop: 20 }}>
          {p.completed
            ? "Votre commande est enregistrée."
            : "Votre récapitulatif de commande"}
        </h1>
        <Notice message={message} />
        {p.completed ? (
          <>
            <p>
              Référence : #{p.order_id?.slice(0, 8)}
              <br />
              Statut : {orderLabels[p.status as OrderStatus] || p.status}
              <br />
              Total : {formatMad(p.total_minor)}
            </p>
            <p>
              Aucun paiement en ligne n’a été effectué par Sellora. La boutique
              vous renseignera sur la livraison et les modalités de règlement.
            </p>
          </>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Produit et variante</th>
                    <th>Quantité</th>
                    <th>Prix unitaire</th>
                  </tr>
                </thead>
                <tbody>
                  {p.items?.map((item, i) => (
                    <tr key={i}>
                      <td>
                        {item.product_name} · {item.variant_name}
                      </td>
                      <td>{item.quantity}</td>
                      <td>{formatMad(item.unit_price_minor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 18 }}>
              Livraison : {formatMad(p.delivery_minor || 0)}
            </p>
            <h2>Total : {formatMad(p.total_minor)}</h2>
            <p>
              Le stock est vérifié au moment de votre confirmation. Lien valable
              jusqu’au{" "}
              {p.expires_at &&
                new Date(p.expires_at).toLocaleString("fr-MA", {
                  timeZone: "Africa/Casablanca",
                })}
              .
            </p>
            <form action={completeCheckout}>
              <input type="hidden" name="token" value={token} />
              <label>
                Nom complet
                <input
                  name="name"
                  minLength={2}
                  maxLength={160}
                  autoComplete="name"
                  required
                />
              </label>
              <div className="grid cols2">
                <label>
                  Téléphone
                  <input
                    name="phone"
                    type="tel"
                    minLength={6}
                    maxLength={40}
                    autoComplete="tel"
                    required
                  />
                </label>
                <label>
                  Ville
                  {p.delivery_cities?.length ? (
                    <select name="city" required>
                      <option value="">Choisir une ville</option>
                      {p.delivery_cities.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name="city"
                      minLength={2}
                      maxLength={100}
                      autoComplete="address-level2"
                      required
                    />
                  )}
                </label>
              </div>
              <label>
                Adresse de livraison
                <textarea
                  name="address"
                  minLength={5}
                  maxLength={1000}
                  autoComplete="street-address"
                  required
                />
              </label>
              <label>
                <input type="checkbox" name="consent" required />
                J’accepte l’utilisation de mes coordonnées par cette boutique
                pour traiter et suivre cette commande.
              </label>
              <label>
                <input type="checkbox" name="whatsapp_opt_in" />
                J’accepte de recevoir les messages WhatsApp de suivi de cette
                boutique.
              </label>
              <label>
                <input type="checkbox" name="agreed" required />
                Je confirme les produits, variantes, quantités et le montant
                total de {formatMad(p.total_minor)}, livraison comprise.
              </label>
              <PendingButton>
                {p.is_simulation
                  ? "Confirmer la simulation"
                  : "Confirmer ma commande"}
              </PendingButton>
            </form>
          </>
        )}
        <small>
          Gardez ce lien privé. Vos coordonnées ne sont pas affichées dans le
          suivi public de ce lien.
        </small>
      </section>
    </main>
  );
}
