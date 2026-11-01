import { billingUsageSchema, estimateUsageCost } from "@/domains/billing/usage";
import Link from "next/link";
import { tenant } from "@/domains/tenants/access";
import { aiConfigured } from "@/lib/config";
import { PageHead } from "@/components/ui";
import { AssistantPanel } from "@/domains/ai/assistant-panel";
import { settingsSchema } from "@/domains/ai/schema";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const { client, organization, role } = await tenant();
  const { conversation } = await searchParams;
  const { data, error } = await client
    .from("ai_settings")
    .select("*")
    .eq("organization_id", organization.id)
    .single();
  if (error) throw new Error("Réglages indisponibles");
  const { data: threads, error: threadsError } = await client
    .from("conversations")
    .select("id,created_at")
    .eq("organization_id", organization.id)
    .eq("is_simulation", true)
    .order("created_at", { ascending: false })
    .limit(10);
  if (threadsError) throw new Error("Historique indisponible");
  const active = threads?.find((t) => t.id === conversation);
  const { data: messages, error: messagesError } = active
    ? await client
        .from("messages")
        .select("role,content")
        .eq("organization_id", organization.id)
        .eq("conversation_id", active.id)
        .order("created_at")
        .limit(100)
    : { data: [], error: null };
  if (messagesError) throw new Error("Messages indisponibles");
  const isManager = ["owner", "admin"].includes(role);
  let usage = 0;
  let tokens = 0;
  let limit = 0;
  let trial = "";
  let cost: string | undefined;
  if (isManager) {
    const [
      { data: events, error: usageError },
      { data: subscription, error: subError },
    ] = await Promise.all([
      client.rpc("billing_usage", { _org: organization.id }),
      client
        .from("subscriptions")
        .select("trial_ends_at,ai_daily_limit")
        .eq("organization_id", organization.id)
        .single(),
    ]);
    if (usageError || subError) throw new Error("Utilisation indisponible");
    const totals = billingUsageSchema.parse(events);
    usage = totals.ai_calls;
    tokens = totals.input_tokens + totals.output_tokens;
    limit = subscription.ai_daily_limit;
    trial = new Date(subscription.trial_ends_at).toLocaleDateString("fr-MA", {
      timeZone: "Africa/Casablanca",
    });
    const estimated = estimateUsageCost(
      totals,
      process.env.AI_INPUT_USD_PER_MILLION,
      process.env.AI_OUTPUT_USD_PER_MILLION,
    );
    if (estimated !== null) cost = estimated.toFixed(4);
  }
  return (
    <>
      <PageHead
        title="Votre assistant IA"
        description="Une personnalité à votre image. Des réponses ancrées dans votre catalogue."
      >
        <span className="badge">FR · العربية · الدارجة</span>
      </PageHead>
      {isManager && (
        <div className="notice">
          Aujourd’hui (UTC) : {usage} / {limit} tentatives · {tokens} tokens
          enregistrés ·{" "}
          {cost
            ? `coût estimé : ${cost} USD`
            : "coût non estimé : tarifs fournisseur non configurés"}{" "}
          · fin de l’essai : {trial}. Les tentatives échouées consomment aussi
          le quota ; leur coût fournisseur peut être inconnu.
        </div>
      )}
      <AssistantPanel
        key={active?.id || "new"}
        settings={settingsSchema.parse(data)}
        responseMode={data.mode}
        configured={aiConfigured()}
        canEdit={isManager}
        canSimulate={role !== "viewer"}
        initialMessages={messages || []}
        initialConversation={active?.id}
      />
      {Boolean(threads?.length) && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2>Dernières simulations</h2>
          <div className="row">
            {threads?.map((t) => (
              <Link
                className="btn secondary small"
                key={t.id}
                href={`/app/assistant?conversation=${t.id}`}
              >
                {new Date(t.created_at).toLocaleString("fr-MA", {
                  timeZone: "Africa/Casablanca",
                })}
              </Link>
            ))}
          </div>
          <small>
            Historique partagé avec les membres de cette boutique, jusqu’à 100
            messages affichés par simulation.
          </small>
        </section>
      )}
    </>
  );
}
