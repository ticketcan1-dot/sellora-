import { session } from "@/domains/tenants/access";
import { createShop, selectShop } from "@/domains/tenants/actions";
import { PageHead, Notice, Empty } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { client, user } = await session();
  const { data, error } = await client
    .from("memberships")
    .select("organization_id,role,organizations(name)")
    .eq("user_id", user.id);
  if (error) throw new Error("Impossible de charger les boutiques.");
  const { message } = await searchParams;
  return (
    <>
      <PageHead
        title="Vos boutiques"
        description="Un espace indépendant pour chacun de vos commerces."
      />
      <Notice message={message} />
      <div className="grid cols2">
        <section className="card">
          <h2>Choisir une boutique</h2>
          {data?.length ? (
            data.map((m) => {
              const o = (Array.isArray(m.organizations)
                ? m.organizations[0]
                : m.organizations) as unknown as { name: string };
              return (
                <form
                  action={selectShop}
                  className="row between"
                  key={m.organization_id}
                  style={{
                    padding: "16px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <strong>{o?.name}</strong>
                    <br />
                    <span className="badge">{m.role}</span>
                  </div>
                  <input name="id" type="hidden" value={m.organization_id} />
                  <PendingButton className="btn secondary small">
                    Ouvrir
                  </PendingButton>
                </form>
              );
            })
          ) : (
            <Empty title="Votre histoire commence ici">
              Créez votre première boutique pour ajouter votre catalogue.
            </Empty>
          )}
        </section>
        <section className="card">
          <h2>Créer une boutique</h2>
          <p>
            Les produits, conversations et réglages seront isolés des autres
            boutiques.
          </p>
          <form action={createShop}>
            <label>
              Nom de la boutique
              <input
                name="name"
                minLength={2}
                maxLength={100}
                required
                placeholder="Le nom de votre commerce"
              />
            </label>
            <small>Devise : dirham marocain (MAD).</small>
            <div style={{ marginTop: 20 }}>
              <PendingButton>Créer ma boutique</PendingButton>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
