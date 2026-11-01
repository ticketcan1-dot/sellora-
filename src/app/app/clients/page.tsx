import Link from "next/link";
import { tenant } from "@/domains/tenants/access";
import { PageHead, Notice, Empty } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { saveCustomer, anonymizeCustomer } from "@/domains/customers/actions";
import { z } from "zod";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    message?: string;
    q?: string;
    id?: string;
    page?: string;
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
  let query = client
    .from("customers")
    .select("*", { count: "exact" })
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * 50, page * 50 - 1);
  if (params.q)
    query = query.ilike(
      "name",
      "%" + params.q.slice(0, 100).replace(/[%_]/g, "") + "%",
    );
  const { data, error, count } = await query;
  if (error)
    throw new Error("Clients indisponibles. Vérifiez la migration 004.");
  let selected = null;
  if (params.id && z.uuid().safeParse(params.id).success) {
    const { data, error } = await client
      .from("customers")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("id", params.id)
      .single();
    if (!error) selected = data;
  }
  const edit = role !== "viewer";
  return (
    <>
      <PageHead
        title="Vos clients"
        description="Coordonnées, consentements et suivi de la relation client."
      />
      <Notice message={params.message} />
      <div className="grid cols2">
        <section className="card">
          <form className="row" method="get">
            <label style={{ flex: 1 }}>
              Rechercher par nom
              <input name="q" defaultValue={params.q} maxLength={100} />
            </label>
            <button className="btn secondary">Rechercher</button>
          </form>
          <small>
            {count || 0} fiche(s) · page {page}
          </small>
          {data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Ville</th>
                    <th>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={"/app/clients?id=" + c.id}>
                          <strong>{c.name}</strong>
                        </Link>
                      </td>
                      <td>{c.city || "—"}</td>
                      <td>
                        {c.phone || "—"}
                        <br />
                        <small>
                          {c.whatsapp_opt_in_at
                            ? "Opt-in WhatsApp enregistré"
                            : "Sans opt-in WhatsApp"}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Aucun client">
              Créez une fiche avec le consentement du client pour préparer une
              commande.
            </Empty>
          )}
          <div className="row" style={{ marginTop: 16 }}>
            {page > 1 && (
              <Link
                className="btn secondary small"
                href={
                  "?" +
                  new URLSearchParams({
                    q: params.q || "",
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
                    q: params.q || "",
                    page: String(page + 1),
                  })
                }
              >
                Suivant
              </Link>
            )}
          </div>
        </section>
        <section className="card">
          <div className="row between">
            <h2>
              {selected ? "Fiche de " + selected.name : "Ajouter un client"}
            </h2>
            {selected && (
              <Link className="btn secondary small" href="/app/clients">
                Nouvelle fiche
              </Link>
            )}
          </div>
          <form action={saveCustomer} key={selected?.id || "new"}>
            <fieldset
              disabled={!edit}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              {selected && (
                <input type="hidden" name="id" value={selected.id} />
              )}
              <label>
                Nom complet
                <input
                  name="name"
                  minLength={2}
                  maxLength={160}
                  required
                  defaultValue={selected?.name}
                />
              </label>
              <div className="grid cols2">
                <label>
                  Téléphone
                  <input
                    name="phone"
                    type="tel"
                    maxLength={40}
                    defaultValue={selected?.phone || ""}
                  />
                </label>
                <label>
                  Ville
                  <input
                    name="city"
                    maxLength={100}
                    defaultValue={selected?.city}
                  />
                </label>
              </div>
              <label>
                Adresse
                <textarea
                  name="address"
                  maxLength={1000}
                  defaultValue={selected?.address || ""}
                />
              </label>
              <label>
                Notes internes
                <textarea
                  name="notes"
                  maxLength={4000}
                  defaultValue={selected?.notes}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  name="consent"
                  required
                  defaultChecked={Boolean(selected?.consent_at)}
                />
                Le client a accepté l’utilisation de ses coordonnées pour le
                suivi de sa demande.
              </label>
              <label>
                <input
                  type="checkbox"
                  name="whatsapp_opt_in"
                  defaultChecked={Boolean(selected?.whatsapp_opt_in_at)}
                />
                Accord explicite pour recevoir des messages WhatsApp, enregistré
                auprès du client.
              </label>
              <small>
                Ne cochez pas un consentement sans l’avoir obtenu. Aucun message
                de prospection n’est envoyé automatiquement.
              </small>
              <div style={{ marginTop: 18 }}>
                <PendingButton>Enregistrer le client</PendingButton>
              </div>
            </fieldset>
          </form>
          {selected && ["owner", "admin"].includes(role) && (
            <details style={{ marginTop: 24 }}>
              <summary>Effacer les coordonnées du client</summary>
              <p>
                Les coordonnées et récapitulatifs de commandes seront
                anonymisés. Les commandes ouvertes doivent d’abord être traitées
                ; les textes de conversation sont conservés selon vos règles.
              </p>
              <form action={anonymizeCustomer}>
                <input name="id" type="hidden" value={selected.id} />
                <label>
                  <input name="confirm" type="checkbox" required />
                  Je confirme cet effacement des coordonnées.
                </label>
                <PendingButton className="btn danger small">
                  Anonymiser le client
                </PendingButton>
              </form>
            </details>
          )}
          {!edit && <p>Votre rôle permet uniquement la consultation.</p>}
        </section>
      </div>
    </>
  );
}
