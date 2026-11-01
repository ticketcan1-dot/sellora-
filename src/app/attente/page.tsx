import { authDestination } from "@/domains/auth/destinations";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3 } from "lucide-react";
import { Brand } from "@/components/ui";
import { db } from "@/lib/supabase/server";
import { configured } from "@/lib/config";
import { ApprovalWatcher } from "@/domains/auth/approval-watcher";
import { signOut } from "@/domains/auth/actions";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const destination = authDestination((await searchParams).next);
  let loggedIn = false;
  let status = "pending";
  let unavailable = false;
  if (configured()) {
    const client = await db();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) {
      loggedIn = true;
      const { data, error } = await client
        .from("profiles")
        .select("approval_status")
        .eq("id", user.id)
        .single();
      unavailable = Boolean(error);
      status = data?.approval_status || "pending";
      if (status === "approved") redirect(destination);
    }
  }
  return (
    <main className="legal" style={{ maxWidth: 560 }}>
      <Brand />
      <section className="card" style={{ marginTop: 40 }}>
        <span className="metric-icon" style={{ width: "fit-content" }}>
          <Clock3 size={26} />
        </span>
        <h1 style={{ marginTop: 24 }}>
          {status === "rejected"
            ? "Accès non autorisé"
            : "Votre compte est en attente."}
        </h1>
        <p>
          Un administrateur doit confirmer votre compte avant que vous puissiez
          accéder à Sellora.
        </p>
        {unavailable ? (
          <div className="notice warning">
            Vérification indisponible. L’administrateur doit vérifier la
            migration 003.
          </div>
        ) : loggedIn ? (
          <ApprovalWatcher destination={destination} />
        ) : (
          <p role="status">
            Consultez votre email pour confirmer votre adresse, puis
            connectez-vous. Si l’accès a déjà été approuvé, votre espace
            s’ouvrira directement.
          </p>
        )}
        <small>
          L’approbation administrateur et la confirmation de votre adresse email
          sont deux étapes distinctes. L’ouverture automatique nécessite une
          session encore valide dans ce navigateur.
        </small>
        <div className="row" style={{ marginTop: 24 }}>
          <Link
            className="btn secondary"
            href={"/connexion?next=" + encodeURIComponent(destination)}
          >
            Aller à la connexion
          </Link>
          {loggedIn && (
            <form action={signOut}>
              <button className="btn secondary">Se déconnecter</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
