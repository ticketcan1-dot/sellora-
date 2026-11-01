"use server";
import { z } from "zod";
import { tenant } from "@/domains/tenants/access";
import { finish, dbMessage } from "@/lib/forms";
import { aiConfigured } from "@/lib/config";
import {
  createAiSuggestion,
  processOutbound,
  validSuggestion,
} from "@/domains/integrations/worker";
const path = (id: string) => "/app/conversations?id=" + id;
export async function updateConversation(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin", "agent"]);
  const id = z.uuid().parse(form.get("id"));
  const { error } = await client.rpc("manage_conversation", {
    _org: organization.id,
    _conversation: id,
    _status: z.enum(["open", "closed", "human"]).parse(form.get("status")),
    _assignee: form.get("assignee")
      ? z.uuid().parse(form.get("assignee"))
      : null,
    _paused: form.get("paused") === "on",
    _customer: form.get("customer")
      ? z.uuid().parse(form.get("customer"))
      : null,
  });
  finish(
    path(id),
    error ? dbMessage(error.message) : "Conversation mise à jour.",
  );
}
export async function addNote(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin", "agent"]);
  const id = z.uuid().parse(form.get("id"));
  const { error } = await client.rpc("add_conversation_note", {
    _org: organization.id,
    _conversation: id,
    _content: z.string().trim().min(1).max(4000).parse(form.get("content")),
  });
  finish(
    path(id),
    error
      ? dbMessage(error.message)
      : "Note interne ajoutée. Elle ne sera pas envoyée au client.",
  );
}
export async function sendReply(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin", "agent"]);
  const id = z.uuid().parse(form.get("id"));
  const suggestion = form.get("suggestion")
    ? z.uuid().parse(form.get("suggestion"))
    : null;
  let content = String(form.get("content") || "");
  if (suggestion) {
    if (!(await validSuggestion(organization.id, suggestion)))
      finish(
        path(id),
        "Suggestion périmée ou assistant en pause. Régénérez une proposition avant l’envoi.",
      );
    const { data } = await client
      .from("ai_suggestions")
      .select("content")
      .eq("organization_id", organization.id)
      .eq("conversation_id", id)
      .eq("id", suggestion)
      .single();
    if (!data) finish(path(id), "Suggestion inaccessible.");
    content = data.content;
  }
  if (!content.trim() || content.length > 1000)
    finish(
      path(id),
      "La réponse doit comporter entre 1 et 1 000 caractères. Rédigez une version plus courte si nécessaire.",
    );
  const { data, error } = await client.rpc("queue_reply", {
    _org: organization.id,
    _conversation: id,
    _content: content,
    _request: z.uuid().parse(form.get("request_id")),
    _suggestion: suggestion,
  });
  if (error)
    finish(
      path(id),
      error.message.includes("Messaging window")
        ? "La fenêtre de réponse de 24 heures est fermée. Attendez un nouveau message du client ou utilisez un modèle approuvé dans les outils officiels."
        : dbMessage(error.message),
    );
  if (data.simulation)
    finish(
      path(id),
      "Réponse enregistrée dans la simulation. Aucun message réel n’a été envoyé.",
    );
  const status = await processOutbound(data.outbox_id);
  finish(
    path(id),
    status === "sent"
      ? "Message accepté par l’API officielle du canal."
      : status === "unknown"
        ? "Envoi incertain : vérifiez la conversation dans le canal avant tout nouvel envoi."
        : status === "failed"
          ? "Envoi bloqué ou refusé. Consultez son état ci-dessous."
          : "Message en attente de traitement ou de reprise.",
  );
}
export async function generateSuggestion(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin", "agent"]);
  const id = z.uuid().parse(form.get("id"));
  if (!aiConfigured())
    finish(
      path(id),
      "Modèle IA non configuré. Renseignez le fournisseur dans les variables serveur.",
    );
  const { data: message } = await client
    .from("messages")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("conversation_id", id)
    .eq("role", "user")
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!message) finish(path(id), "Aucun message entrant à analyser.");
  const result = await createAiSuggestion(
    organization.id,
    id,
    message.id,
    undefined,
    true,
  );
  finish(
    path(id),
    result?.status === "approved"
      ? "Une réponse a déjà été traitée pour ce message. Rédigez une réponse humaine ou attendez un nouveau message client."
      : result
        ? "Suggestion prête pour validation humaine."
        : "Suggestion indisponible : vérifiez les quotas, la pause et le fournisseur IA.",
  );
}
export async function rejectSuggestion(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin", "agent"]);
  const id = z.uuid().parse(form.get("id"));
  const { error } = await client.rpc("reject_suggestion", {
    _org: organization.id,
    _suggestion: z.uuid().parse(form.get("suggestion")),
  });
  finish(path(id), error ? dbMessage(error.message) : "Suggestion refusée.");
}
export async function retryReply(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin", "agent"]);
  const id = z.uuid().parse(form.get("id"));
  const outbox = z.uuid().parse(form.get("outbox"));
  const { data } = await client
    .from("message_outbox")
    .select("id,status")
    .eq("organization_id", organization.id)
    .eq("conversation_id", id)
    .eq("id", outbox)
    .eq("status", "queued")
    .single();
  if (!data)
    finish(path(id), "Cet envoi ne peut pas être repris automatiquement.");
  await processOutbound(data.id);
  finish(
    path(id),
    "État de la file actualisé. Les délais de reprise restent respectés.",
  );
}
