"use client";
import { useState } from "react";
import { createOrder } from "./actions";
import { formatMad } from "@/domains/catalog/schema";
import { PendingButton } from "@/components/pending-button";
type Variant = {
  id: string;
  name: string;
  price_minor: number;
  stock: number;
  productName: string;
};
export function OrderForm({
  customers,
  variants,
  conversation,
}: {
  customers: { id: string; name: string }[];
  variants: Variant[];
  conversation?: string;
}) {
  const [items, setItems] = useState<
    { variant_id: string; quantity: number }[]
  >([{ variant_id: variants[0]?.id || "", quantity: 1 }]);
  const [mode, setMode] = useState("draft");
  const total = items.reduce(
    (sum, item) =>
      sum +
      (variants.find((v) => v.id === item.variant_id)?.price_minor || 0) *
        item.quantity,
    0,
  );
  return (
    <details className="card">
      <summary>Créer une commande</summary>
      <p>
        Les prix sont relus côté serveur. Les coordonnées complètes et le
        consentement du client sont obligatoires.
      </p>
      <form action={createOrder}>
        <label>
          Type de préparation
          <select
            name="create_mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="draft">Brouillon interne</option>
            <option value="link">
              Lien de confirmation à partager au client
            </option>
          </select>
        </label>
        <label>
          Client
          <select name="customer" required={mode === "draft"}>
            <option value="">Choisir un client</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {conversation && (
          <input type="hidden" name="conversation" value={conversation} />
        )}
        <input type="hidden" name="items" value={JSON.stringify(items)} />
        {items.map((item, i) => (
          <div className="row" key={i}>
            <label style={{ flex: "1 1 240px" }}>
              Produit et variante
              <select
                value={item.variant_id}
                required
                onChange={(e) =>
                  setItems((xs) =>
                    xs.map((x, n) =>
                      n === i ? { ...x, variant_id: e.target.value } : x,
                    ),
                  )
                }
              >
                <option value="">Choisir une variante</option>
                {variants.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.productName} · {v.name} · {formatMad(v.price_minor)} ·
                    stock {v.stock}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantité
              <input
                type="number"
                min={1}
                max={10000}
                value={item.quantity}
                required
                onChange={(e) =>
                  setItems((xs) =>
                    xs.map((x, n) =>
                      n === i ? { ...x, quantity: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
            </label>
            {items.length > 1 && (
              <button
                type="button"
                className="btn danger small"
                onClick={() => setItems((xs) => xs.filter((_, n) => n !== i))}
              >
                Retirer
              </button>
            )}
          </div>
        ))}
        <button
          className="btn secondary small"
          type="button"
          disabled={items.length >= 50}
          onClick={() =>
            setItems((xs) => [...xs, { variant_id: "", quantity: 1 }])
          }
        >
          Ajouter une ligne
        </button>
        <p style={{ marginTop: 16 }}>
          Sous-total indicatif : {formatMad(total)}
        </p>
        <label>
          Frais de livraison (MAD)
          <input
            name="delivery"
            defaultValue="0.00"
            inputMode="decimal"
            required
            pattern="[0-9]+([.,][0-9]{1,2})?"
          />
        </label>
        <label>
          Notes de commande
          <textarea name="notes" maxLength={4000} />
        </label>
        {conversation && (
          <div className="notice">
            La source et le caractère simulé/réel sont repris de la
            conversation. Une commande simulée ne réduit jamais le stock et
            n’entre pas dans le chiffre d’affaires.
          </div>
        )}
        <PendingButton>
          {mode === "link" ? "Créer le lien privé" : "Créer le brouillon"}
        </PendingButton>
      </form>
    </details>
  );
}
