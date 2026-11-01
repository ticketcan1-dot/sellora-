import { MessageText } from "@/components/message-text";
import { deliveryLabels, deliveryError } from "@/domains/conversations/labels";
import { InboxAutoRefresh } from "@/domains/conversations/auto-refresh";
import Link from "next/link";
import Image from "next/image";
import { z } from "zod";
import { tenant } from "@/domains/tenants/access";
import { PageHead, Notice, Empty } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import {
  updateConversation,
  addNote,
  sendReply,
  generateSuggestion,
  rejectSuggestion,
  retryReply,
} from "@/domains/conversations/actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    message?: string;
    id?: string;
    status?: string;
    source?: string;
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
    .from("conversations")
    .select(
      "id,subject,status,source,is_simulation,updated_at,customers(name)",
      { count: "exact" },
    )
    .eq("organization_id", organization.id)
    .order("updated_at", { ascending: false })
    .range((page - 1) * 50, page * 50 - 1);
  if (["open", "closed", "human"].includes(params.status || ""))
    query = query.eq("status", params.status);
  if (["instagram", "whatsapp", "simulation"].includes(params.source || ""))
    query = query.eq("source", params.source);
  const { data: threads, error, count } = await query;
  if (error) throw new Error("Conversations indisponibles.");
  const id = z.uuid().safeParse(params.id).success
    ? params.id
    : threads?.[0]?.id;
  const selected = id
    ? await client
        .from("conversations")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("id", id)
        .maybeSingle()
    : { data: null, error: null };
  if (selected.error) throw new Error("Conversation inaccessible.");
  const thread = selected.data;
  const [
    { data: messages, error: me },
    { data: notes, error: ne },
    { data: suggestions, error: se },
    { data: team, error: te },
    { data: customers, error: ce },
    { data: outbox, error: oe },
  ] = thread
    ? await Promise.all([
        client
          .from("messages")
          .select("*")
          .eq("organization_id", organization.id)
          .eq("conversation_id", thread.id)
          .order("occurred_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200),
        client
          .from("conversation_notes")
          .select("*")
          .eq("organization_id", organization.id)
          .eq("conversation_id", thread.id)
          .order("created_at", { ascending: false })
          .limit(30),
        client
          .from("ai_suggestions")
          .select("*")
          .eq("organization_id", organization.id)
          .eq("conversation_id", thread.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(10),
        client.rpc("list_team", { _org: organization.id }),
        client
          .from("customers")
          .select("id,name")
          .eq("organization_id", organization.id)
          .order("name")
          .limit(1000),
        client
          .from("message_outbox")
          .select("id,status,error_code,created_at")
          .eq("organization_id", organization.id)
          .eq("conversation_id", thread.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ])
    : Array.from({ length: 6 }, () => ({ data: [], error: null }));
  if (me || ne || se || te || ce || oe)
    throw new Error(
      "Fil de conversation indisponible. Vérifiez les migrations.",
    );
  const canEdit = role !== "viewer";
  return (
    <div className="stack">
      <PageHead
        title="Conversations"
        description="Une messagerie par boutique, avec simulations clairement séparées des échanges réels."
      />
      <Notice message={params.message} />
      <InboxAutoRefresh conversation={thread?.id} />
      <form method="get" className="card row">
        <label>
          Statut
          <select name="status" defaultValue={params.status || ""}>
            <option value="">Tous</option>
            <option value="open">Ouvertes</option>
            <option value="human">Reprise humaine</option>
            <option value="closed">Closes</option>
          </select>
        </label>
        <label>
          Canal
          <select name="source" defaultValue={params.source || ""}>
            <option value="">Tous</option>
            <option value="instagram">Instagram</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="simulation">Simulation</option>
          </select>
        </label>
        <button className="btn secondary">Filtrer</button>
        <small>{count || 0} conversation(s)</small>
      </form>
      <div className="inbox-grid">
        <section className="card thread-list" style={{ padding: 0 }}>
          {threads?.length ? (
            threads.map((t) => {
              const c = (Array.isArray(t.customers)
                ? t.customers[0]
                : t.customers) as unknown as { name: string } | null;
              return (
                <Link
                  className={
                    "thread-link " + (t.id === thread?.id ? "active" : "")
                  }
                  key={t.id}
                  href={"?id=" + t.id}
                >
                  <span
                    className={`badge ${t.is_simulation ? "amber" : "green"}`}
                  >
                    {t.is_simulation ? "SIMULATION" : t.source}
                  </span>
                  <h3 style={{ margin: "10px 0 4px" }}>
                    {c?.name || t.subject || "Conversation"}
                  </h3>
                  <small>
                    {t.status === "human"
                      ? "Reprise humaine"
                      : t.status === "closed"
                        ? "Close"
                        : "Ouverte"}{" "}
                    ·{" "}
                    {new Date(t.updated_at).toLocaleDateString("fr-MA", {
                      timeZone: "Africa/Casablanca",
                    })}
                  </small>
                </Link>
              );
            })
          ) : (
            <Empty title="Aucun échange pour le moment">
              Les messages des canaux connectés et vos tests de simulation
              apparaîtront ici.
            </Empty>
          )}
          <div className="row" style={{ padding: 12 }}>
            {page > 1 && (
              <Link
                className="btn secondary small"
                href={"?page=" + (page - 1)}
              >
                Précédent
              </Link>
            )}
            {page * 50 < (count || 0) && (
              <Link
                className="btn secondary small"
                href={"?page=" + (page + 1)}
              >
                Suivant
              </Link>
            )}
          </div>
        </section>
        {thread ? (
          <section className="stack">
            <div className="card">
              <div className="row between">
                <h2>{thread.subject || "Conversation"}</h2>
                <span
                  className={`badge ${thread.is_simulation ? "amber" : "green"}`}
                >
                  {thread.is_simulation
                    ? "SIMULATION — aucun envoi réel"
                    : thread.source}
                </span>
              </div>
              {!thread.is_simulation && (
                <p style={{ fontSize: 12 }}>
                  Dernier message client :{" "}
                  {thread.last_inbound_at
                    ? new Date(thread.last_inbound_at).toLocaleString("fr-MA", {
                        timeZone: "Africa/Casablanca",
                      })
                    : "inconnu"}
                  . Les réponses libres sont limitées à la fenêtre de 24 heures.
                </p>
              )}
              <div
                className="chat"
                role="log"
                aria-label="Messages de la conversation"
              >
                {[...(messages || [])]
                  .reverse()
                  .map(
                    (m: {
                      id: string;
                      role: string;
                      content: string;
                      image_path?: string;
                      delivery_status: string;
                      created_at: string;
                      occurred_at: string;
                    }) => (
                      <div
                        key={m.id}
                        className={
                          "bubble " + (m.role === "user" ? "user" : "assistant")
                        }
                        dir="auto"
                      >
                        <div
                          className="message-meta"
                          style={{
                            color: m.role === "user" ? "#e4e8ff" : undefined,
                          }}
                        >
                          {m.role === "user"
                            ? "Client"
                            : m.role === "assistant"
                              ? "Assistant IA"
                              : "Équipe · humain"}{" "}
                          ·{" "}
                          {new Date(
                            m.occurred_at || m.created_at,
                          ).toLocaleTimeString("fr-MA", {
                            timeZone: "Africa/Casablanca",
                          })}{" "}
                          ·{" "}
                          {deliveryLabels[m.delivery_status] ||
                            m.delivery_status}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap" }}>
                          <MessageText text={m.content} />
                        </div>
                        {m.image_path && (
                          <Image
                            src={"/app/conversations/media/" + m.id}
                            unoptimized
                            width={260}
                            height={200}
                            style={{ objectFit: "contain", maxWidth: "100%" }}
                            alt="Image reçue dans cette conversation"
                          />
                        )}
                      </div>
                    ),
                  )}
              </div>
              <small>
                Les 200 derniers messages sont affichés. Les notes internes
                restent séparées.
              </small>
              {canEdit && thread.status !== "closed" && (
                <form action={sendReply} style={{ marginTop: 18 }}>
                  <input name="id" type="hidden" value={thread.id} />
                  <input
                    type="hidden"
                    name="request_id"
                    value={crypto.randomUUID()}
                  />
                  <label>
                    Réponse de l’équipe
                    <textarea
                      name="content"
                      maxLength={1000}
                      required
                      placeholder="Rédiger une réponse…"
                    />
                  </label>
                  <PendingButton>
                    {thread.is_simulation
                      ? "Répondre dans la simulation"
                      : "Envoyer via le canal officiel"}
                  </PendingButton>
                </form>
              )}
              {outbox?.map(
                (o: {
                  id: string;
                  status: string;
                  error_code: string | null;
                }) => (
                  <div
                    key={o.id}
                    className="notice"
                    style={{ marginTop: 12, marginBottom: 0 }}
                  >
                    Envoi : {deliveryLabels[o.status] || o.status}
                    {o.error_code && " · " + deliveryError(o.error_code)}
                    {o.status === "unknown" && (
                      <p>
                        La réception n’a pas pu être confirmée. Vérifiez le
                        canal avant tout nouvel envoi.
                      </p>
                    )}
                    {canEdit && o.status === "queued" && (
                      <form action={retryReply}>
                        <input type="hidden" name="id" value={thread.id} />
                        <input type="hidden" name="outbox" value={o.id} />
                        <PendingButton className="btn secondary small">
                          Reprendre si le délai est écoulé
                        </PendingButton>
                      </form>
                    )}
                  </div>
                ),
              )}
            </div>
            {canEdit && (
              <section className="card">
                <div className="row between">
                  <h2>Propositions IA</h2>
                  <form action={generateSuggestion}>
                    <input name="id" type="hidden" value={thread.id} />
                    <PendingButton className="btn secondary small">
                      Préparer une suggestion
                    </PendingButton>
                  </form>
                </div>
                {!suggestions?.length && (
                  <p>
                    Aucune proposition en attente. Sans fournisseur IA
                    configuré, rédigez une réponse humaine.
                  </p>
                )}
                {suggestions?.map(
                  (s: {
                    id: string;
                    content: string;
                    needs_human: boolean;
                  }) => (
                    <article
                      key={s.id}
                      style={{
                        borderTop: "1px solid var(--border)",
                        padding: "16px 0",
                      }}
                    >
                      <span
                        className={`badge ${s.needs_human ? "amber" : "green"}`}
                      >
                        {s.needs_human
                          ? "Clarification / revue humaine requise"
                          : "À valider avant envoi"}
                      </span>
                      <p
                        dir="auto"
                        style={{ whiteSpace: "pre-wrap", marginTop: 12 }}
                      >
                        {s.content}
                      </p>
                      <div className="row">
                        <form action={sendReply}>
                          <input type="hidden" name="id" value={thread.id} />
                          <input type="hidden" name="suggestion" value={s.id} />
                          <input
                            type="hidden"
                            name="request_id"
                            value={crypto.randomUUID()}
                          />
                          <PendingButton>Approuver et envoyer</PendingButton>
                        </form>
                        <form action={rejectSuggestion}>
                          <input type="hidden" name="id" value={thread.id} />
                          <input type="hidden" name="suggestion" value={s.id} />
                          <PendingButton className="btn danger small">
                            Refuser
                          </PendingButton>
                        </form>
                      </div>
                    </article>
                  ),
                )}
              </section>
            )}
            <section className="card">
              <h2>Suivi et reprise humaine</h2>
              {canEdit && (
                <form action={updateConversation}>
                  <input type="hidden" name="id" value={thread.id} />
                  <div className="grid cols2">
                    <label>
                      Statut
                      <select name="status" defaultValue={thread.status}>
                        <option value="open">Ouverte</option>
                        <option value="human">Reprise humaine</option>
                        <option value="closed">Close</option>
                      </select>
                    </label>
                    <label>
                      Responsable
                      <select
                        name="assignee"
                        defaultValue={thread.assigned_to || ""}
                      >
                        <option value="">Non assignée</option>
                        {team
                          ?.filter((m: { role: string }) => m.role !== "viewer")
                          .map(
                            (m: {
                              user_id: string;
                              email: string;
                              role: string;
                            }) => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.email} · {m.role}
                              </option>
                            ),
                          )}
                      </select>
                    </label>
                    <label>
                      Fiche client
                      <select
                        name="customer"
                        defaultValue={thread.customer_id || ""}
                      >
                        <option value="">Non associée</option>
                        {customers?.map((c: { id: string; name: string }) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    <input
                      name="paused"
                      type="checkbox"
                      defaultChecked={thread.ai_paused}
                    />
                    Suspendre l’IA pour cette conversation
                  </label>
                  <PendingButton className="btn secondary">
                    Enregistrer le suivi
                  </PendingButton>
                </form>
              )}
              <div className="row" style={{ marginTop: 20 }}>
                {thread.customer_id && (
                  <Link
                    href={"/app/clients?id=" + thread.customer_id}
                    className="btn secondary small"
                  >
                    Ouvrir le client
                  </Link>
                )}
                {canEdit && (
                  <Link
                    className="btn secondary small"
                    href={"/app/commandes?conversation=" + thread.id}
                  >
                    Préparer une commande
                  </Link>
                )}
              </div>
            </section>
            <section className="card">
              <h2>Notes internes</h2>
              {canEdit && (
                <form action={addNote}>
                  <input type="hidden" name="id" value={thread.id} />
                  <label>
                    Note visible uniquement à l’équipe
                    <textarea name="content" required maxLength={4000} />
                  </label>
                  <PendingButton className="btn secondary">
                    Ajouter une note interne
                  </PendingButton>
                </form>
              )}
              {notes?.map(
                (n: { id: string; content: string; created_at: string }) => (
                  <p
                    style={{ whiteSpace: "pre-wrap", marginTop: 18 }}
                    key={n.id}
                  >
                    {n.content}
                    <br />
                    <small>
                      {new Date(n.created_at).toLocaleString("fr-MA", {
                        timeZone: "Africa/Casablanca",
                      })}
                    </small>
                  </p>
                ),
              )}
            </section>
          </section>
        ) : (
          <section className="card">
            <Empty title="Votre messagerie est prête">
              Connectez un canal autorisé ou lancez une simulation pour
              commencer.
            </Empty>
          </section>
        )}
      </div>
    </div>
  );
}
