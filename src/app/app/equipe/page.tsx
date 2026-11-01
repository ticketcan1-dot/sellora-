import { cookies } from "next/headers";
import { tenant } from "@/domains/tenants/access";
import { PageHead, Notice } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import {
  inviteMember,
  revokeInvitation,
  manageMember,
  transferOwnership,
} from "@/domains/tenants/team-actions";
import { z } from "zod";
const member = z.object({
  user_id: z.uuid(),
  email: z.string().nullable(),
  role: z.enum(["owner", "admin", "agent", "viewer"]),
});
const invite = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.string(),
  expires_at: z.string(),
  used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { client, organization, role, user } = await tenant();
  const { message } = await searchParams;
  const { data, error } = await client.rpc("list_team", {
    _org: organization.id,
  });
  if (error) throw new Error("Équipe indisponible. Vérifiez la migration 005.");
  const members = z.array(member).parse(data);
  const manager = ["owner", "admin"].includes(role);
  const invites = manager
    ? await client.rpc("list_invitations", { _org: organization.id })
    : { data: [], error: null };
  if (invites.error) throw new Error("Invitations indisponibles.");
  const invitations = z.array(invite).parse(invites.data);
  const invitationLink = manager
    ? (await cookies()).get("sellora_invitation_link")?.value
    : undefined;
  return (
    <div className="stack">
      <PageHead
        title="Votre équipe"
        description="Des accès adaptés à chaque personne, dans cette boutique uniquement."
      />
      <Notice message={message} />
      {invitationLink && (
        <section className="card">
          <h2>Lien de la dernière invitation</h2>
          <p>
            Visible pendant cinq minutes dans ce navigateur. Ne le publiez pas.
          </p>
          <label>
            Copier le lien
            <input readOnly value={invitationLink} />
          </label>
          <small>
            Vérifiez le destinataire avant de le transmettre. Sans service email
            configuré, ce partage manuel est le moyen d’invitation.
          </small>
        </section>
      )}
      <section className="card">
        <h2>{members.length} membre(s)</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Personne</th>
                <th>Rôle</th>
                <th>Gérer</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>
                    {m.email}
                    {m.user_id === user.id && " (vous)"}
                  </td>
                  <td>
                    <span className="badge">{m.role}</span>
                  </td>
                  <td>
                    {role === "owner" && m.role !== "owner" && (
                      <form action={manageMember} className="row">
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <label style={{ margin: 0 }}>
                          <span className="sr-only">Rôle de {m.email}</span>
                          <select name="role" defaultValue={m.role}>
                            <option value="admin">Administrateur</option>
                            <option value="agent">Agent</option>
                            <option value="viewer">Consultation</option>
                            <option value="remove">Retirer l’accès</option>
                          </select>
                        </label>
                        <PendingButton className="btn secondary small">
                          Appliquer
                        </PendingButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {manager && (
        <section className="card">
          <h2>Inviter une personne</h2>
          <form action={inviteMember} className="grid cols3">
            <label>
              Adresse email
              <input name="email" type="email" required maxLength={254} />
            </label>
            <label>
              Rôle
              <select name="role" defaultValue="agent">
                {role === "owner" && (
                  <option value="admin">Administrateur</option>
                )}
                <option value="agent">Agent</option>
                <option value="viewer">Consultation</option>
              </select>
            </label>
            <div style={{ alignSelf: "center" }}>
              <PendingButton>Créer l’invitation</PendingButton>
            </div>
          </form>
          <p>
            Propriétaire : paramètres sensibles et propriété. Administrateur :
            catalogue et gestion. Agent : clients, commandes et conversations.
            Consultation : lecture seule.
          </p>
          {invitations.map((i) => (
            <div
              className="row between"
              key={i.id}
              style={{
                borderTop: "1px solid var(--border)",
                padding: "12px 0",
              }}
            >
              <div>
                {i.email} · {i.role}
                <br />
                <small>
                  {i.used_at
                    ? "Acceptée"
                    : i.revoked_at
                      ? "Révoquée"
                      : new Date(i.expires_at) < new Date()
                        ? "Expirée"
                        : "Expire le " +
                          new Date(i.expires_at).toLocaleDateString("fr-MA", {
                            timeZone: "Africa/Casablanca",
                          })}
                </small>
              </div>
              {!i.used_at && !i.revoked_at && (
                <form action={revokeInvitation}>
                  <input type="hidden" name="id" value={i.id} />
                  <PendingButton className="btn danger small">
                    Révoquer
                  </PendingButton>
                </form>
              )}
            </div>
          ))}
        </section>
      )}
      {role === "owner" && members.length > 1 && (
        <details className="card">
          <summary>Transférer la propriété de la boutique</summary>
          <p>
            Vous deviendrez administrateur. Le nouveau propriétaire doit être un
            membre approuvé.
          </p>
          <form action={transferOwnership}>
            <label>
              Nouveau propriétaire
              <select name="user_id" required>
                {members
                  .filter((m) => m.user_id !== user.id)
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.email}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Recopiez le nom « {organization.name} »
              <input name="confirmation" required />
            </label>
            <PendingButton className="btn danger">
              Transférer la propriété
            </PendingButton>
          </form>
        </details>
      )}
    </div>
  );
}
