import Link from "next/link";
import { tenant } from "@/domains/tenants/access";
import { PageHead, Empty } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
async function markRead() {
  "use server";
  const { client, organization } = await tenant();
  const { error } = await client.rpc("read_notifications", {
    _org: organization.id,
  });
  if (error) throw new Error("Lecture non enregistrée");
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/app/notifications");
}
export default async function Page() {
  const { client, organization, user } = await tenant();
  const { data, error } = await client
    .from("notifications")
    .select("*")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Notifications indisponibles.");
  return (
    <>
      <PageHead
        title="Notifications"
        description="Les événements utiles de votre boutique."
      >
        <form action={markRead}>
          <PendingButton className="btn secondary">
            Tout marquer comme lu
          </PendingButton>
        </form>
      </PageHead>
      <section className="card">
        {data?.length ? (
          data.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              className="row between"
              style={{
                padding: "18px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div>
                <strong>{n.title}</strong>
                <br />
                <small>
                  {new Date(n.created_at).toLocaleString("fr-MA", {
                    timeZone: "Africa/Casablanca",
                  })}
                </small>
              </div>
              {!n.read_by.includes(user.id) && (
                <span className="badge">Nouveau</span>
              )}
            </Link>
          ))
        ) : (
          <Empty title="Vous êtes à jour">
            Les confirmations de commandes et les nouveaux événements
            apparaîtront ici.
          </Empty>
        )}
      </section>
    </>
  );
}
