import Link from "next/link";
import { ShieldCheck, Users, Check, X } from "lucide-react";
import { Brand, Notice } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { platformAdmin } from "@/domains/admin/access";
import { adminCredentials } from "@/domains/admin/session-token";
import {
  adminLogin,
  adminLogout,
  reviewAccount,
} from "@/domains/admin/actions";
import { serviceDb } from "@/lib/supabase/server";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
const accountSchema = z.object({
  user_id: z.uuid(),
  email: z.string().nullable(),
  approval_status: z.enum(["pending", "approved", "rejected"]),
  email_confirmed_at: z.string().nullable(),
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
  total_count: z.coerce.number(),
});
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    message?: string;
    status?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const admin = await platformAdmin();
  if (!admin)
    return (
      <main className="legal" style={{ maxWidth: 460 }}>
        <Brand />
        <section className="card" style={{ marginTop: 40 }}>
          <span className="badge">
            <ShieldCheck size={14} />
            Administration
          </span>
          <h1 style={{ marginTop: 20 }}>Accès administrateur</h1>
          <p>Connectez-vous pour autoriser les comptes Sellora.</p>
          <Notice message={params.message} />
          {!adminCredentials() && (
            <div className="notice warning">
              L’administration doit être configurée dans les variables serveur.
            </div>
          )}
          <form action={adminLogin}>
            <label>
              Adresse email administrateur
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
            <label>
              Mot de passe administrateur
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <PendingButton>Se connecter à l’administration</PendingButton>
          </form>
          <p style={{ marginTop: 20, marginBottom: 0 }}>
            <Link href="/connexion">Connexion commerçant →</Link>
          </p>
        </section>
      </main>
    );
  const status = z
    .enum(["pending", "approved", "rejected", "all"])
    .catch("pending")
    .parse(params.status);
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .catch(1)
    .parse(params.page || 1);
  const search = (params.q || "").slice(0, 200);
  const { data, error } = await serviceDb().rpc("admin_list_accounts", {
    status_filter: status === "all" ? null : status,
    search_text: search,
    page_number: page,
  });
  const accounts = error ? [] : z.array(accountSchema).parse(data);
  const total = accounts[0]?.total_count || 0;
  const labels = {
    pending: "En attente",
    approved: "Approuvé",
    rejected: "Accès refusé",
  };
  const pageUrl = (p: number) =>
    "/admin?" +
    new URLSearchParams({ status, q: search, page: String(p) }).toString();
  return (
    <main className="public-section" style={{ maxWidth: 1200 }}>
      <div className="row between">
        <Brand />
        <form action={adminLogout}>
          <PendingButton className="btn secondary">
            Se déconnecter
          </PendingButton>
        </form>
      </div>
      <div className="page-head" style={{ marginTop: 40 }}>
        <div>
          <span className="eyebrow">Administration Sellora</span>
          <h1 style={{ marginTop: 10 }}>Les accès, sous votre contrôle.</h1>
          <p>Approuvez les nouveaux comptes ou retirez un accès existant.</p>
        </div>
        <span className="badge">
          <Users size={14} />
          {admin.email}
        </span>
      </div>
      <Notice message={params.message} />
      {error && (
        <div className="notice warning" role="alert">
          Impossible de charger les comptes. Vérifiez la migration 003 et la clé
          serveur Supabase.
        </div>
      )}
      <form className="card grid cols3" method="get">
        <label>
          Statut
          <select name="status" defaultValue={status}>
            <option value="pending">En attente</option>
            <option value="approved">Approuvés</option>
            <option value="rejected">Accès refusés</option>
            <option value="all">Tous les comptes</option>
          </select>
        </label>
        <label>
          Rechercher par email
          <input name="q" type="search" defaultValue={search} maxLength={200} />
        </label>
        <div style={{ alignSelf: "center" }}>
          <button className="btn secondary">Filtrer</button>
        </div>
      </form>
      <section className="card" style={{ marginTop: 20 }}>
        <h2>
          {total} compte(s) · page {page}
        </h2>
        {!accounts.length ? (
          <p>Aucun compte à afficher pour ce filtre.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Compte</th>
                  <th>Inscription</th>
                  <th>Email</th>
                  <th>Accès</th>
                  <th>Décision</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.user_id}>
                    <td>{a.email || "Adresse indisponible"}</td>
                    <td>
                      {new Date(a.created_at).toLocaleDateString("fr-MA")}
                    </td>
                    <td>{a.email_confirmed_at ? "Confirmé" : "À confirmer"}</td>
                    <td>
                      <span
                        className={`badge ${a.approval_status === "approved" ? "green" : a.approval_status === "pending" ? "amber" : ""}`}
                      >
                        {labels[a.approval_status]}
                      </span>
                    </td>
                    <td>
                      <div className="row">
                        {a.approval_status !== "approved" && (
                          <form action={reviewAccount}>
                            <input
                              type="hidden"
                              name="user_id"
                              value={a.user_id}
                            />
                            <input
                              type="hidden"
                              name="status"
                              value="approved"
                            />
                            <PendingButton className="btn small">
                              <Check size={13} />
                              Approuver
                            </PendingButton>
                          </form>
                        )}
                        {a.approval_status !== "rejected" && (
                          <form action={reviewAccount}>
                            <input
                              type="hidden"
                              name="user_id"
                              value={a.user_id}
                            />
                            <input
                              type="hidden"
                              name="status"
                              value="rejected"
                            />
                            <PendingButton className="btn danger small">
                              <X size={13} />
                              {a.approval_status === "approved"
                                ? "Retirer l’accès"
                                : "Refuser"}
                            </PendingButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row between" style={{ marginTop: 20 }}>
          {page > 1 ? (
            <Link className="btn secondary small" href={pageUrl(page - 1)}>
              Précédent
            </Link>
          ) : (
            <span />
          )}
          {page * 50 < total && (
            <Link className="btn secondary small" href={pageUrl(page + 1)}>
              Suivant
            </Link>
          )}
        </div>
      </section>
      <p style={{ marginTop: 20, fontSize: 12 }}>
        Chaque décision est journalisée. L’approbation autorise Sellora ; la
        confirmation de l’adresse email reste distincte. Le simple accès à l’URL
        /admin n’accorde aucun privilège.
      </p>
    </main>
  );
}
