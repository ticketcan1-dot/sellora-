import Link from "next/link";
import { tenant } from "@/domains/tenants/access";
import { PageHead, Notice } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import {
  updateShop,
  applyRetention,
  deleteShop,
} from "@/domains/tenants/settings-actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { client, organization, role } = await tenant();
  const { message } = await searchParams;
  const { data: o, error } = await client
    .from("organizations")
    .select("*")
    .eq("id", organization.id)
    .single();
  if (error) throw new Error("Paramètres indisponibles.");
  const manager = ["owner", "admin"].includes(role);
  const { data: logs } = manager
    ? await client
        .from("audit_logs")
        .select("id,action,created_at")
        .eq("organization_id", o.id)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] };
  return (
    <div className="stack">
      <PageHead
        title="Paramètres boutique"
        description="Coordonnées, confidentialité et contrôle de votre espace."
      />
      <Notice message={message} />
      <section className="card">
        <h2>Votre boutique</h2>
        <form action={updateShop}>
          <fieldset disabled={!manager} style={{ border: 0, padding: 0 }}>
            <div className="grid cols2">
              <label>
                Nom de la boutique
                <input
                  name="name"
                  defaultValue={o.name}
                  minLength={2}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Email de contact
                <input
                  name="contact_email"
                  type="email"
                  defaultValue={o.contact_email}
                />
              </label>
              <label>
                Ville
                <input name="city" maxLength={100} defaultValue={o.city} />
              </label>
              <label>
                Seuil d’alerte de stock
                <input
                  name="low_stock_threshold"
                  type="number"
                  min={0}
                  max={1000000}
                  required
                  defaultValue={o.low_stock_threshold}
                />
              </label>
              <label>
                Conservation des conversations closes (jours)
                <input
                  name="retention_days"
                  type="number"
                  min={30}
                  max={3650}
                  defaultValue={o.retention_days}
                  required
                />
              </label>
            </div>
            <label>
              <input
                name="is_active"
                type="checkbox"
                defaultChecked={o.is_active}
                disabled={role !== "owner"}
              />
              Boutique active (seul le propriétaire peut changer cet état)
            </label>
            <p>
              La désactivation empêche les nouvelles opérations commerciales et
              réponses IA. La consultation et les paramètres restent
              accessibles.
            </p>
            <PendingButton>Enregistrer les paramètres</PendingButton>
          </fieldset>
        </form>
      </section>
      {manager && (
        <section className="card">
          <h2>Vos données</h2>
          <p>
            L’export contient les données de la boutique et les chemins de ses
            images, sans jetons techniques ni clés API. Protégez ce fichier
            contenant des données personnelles.
          </p>
          <Link
            className="btn secondary"
            href="/app/parametres/export"
            prefetch={false}
          >
            Exporter les données JSON
          </Link>
          {role === "owner" && (
            <form action={applyRetention} style={{ marginTop: 20 }}>
              <p>
                Effacer le texte des messages de conversations closes plus
                anciens que {o.retention_days} jours, ainsi que les suggestions
                et notes anciennes. Les historiques de commandes restent
                conservés pour revue comptable.
              </p>
              <PendingButton className="btn secondary">
                Appliquer la conservation maintenant
              </PendingButton>
            </form>
          )}
          <small>
            Les pièces déjà téléchargées et les liens signés restent utilisables
            jusqu’à leur expiration. Vérifiez avec un conseil les durées légales
            applicables aux commandes.
          </small>
        </section>
      )}
      {manager && (
        <section className="card">
          <h2>Dernières actions sensibles</h2>
          {logs?.length ? (
            logs.map((l) => (
              <p key={l.id}>
                <span className="badge">{l.action}</span>{" "}
                {new Date(l.created_at).toLocaleString("fr-MA", {
                  timeZone: "Africa/Casablanca",
                })}
              </p>
            ))
          ) : (
            <p>Aucune action enregistrée.</p>
          )}
        </section>
      )}
      {role === "owner" && (
        <details className="card">
          <summary>Supprimer définitivement la boutique</summary>
          <p>
            Cette opération supprime produits, fichiers, clients, conversations,
            commandes, membres et réglages de cette boutique. Exportez les
            données nécessaires avant de continuer.
          </p>
          <form action={deleteShop}>
            <label>
              Recopiez « {o.name} »<input name="confirmation" required />
            </label>
            <label>
              <input name="understood" type="checkbox" required />
              Je comprends que cette suppression est définitive.
            </label>
            <PendingButton className="btn danger">
              Supprimer définitivement
            </PendingButton>
          </form>
        </details>
      )}
    </div>
  );
}
