import Link from "next/link";
import { requirePlatformAdmin } from "@/domains/admin/access";
import { serviceDb } from "@/lib/supabase/server";
import { processJobs } from "@/domains/integrations/worker";
import { aiConfigured } from "@/lib/config";
import { metaReady } from "@/domains/integrations/meta-api";
import { Brand, Notice } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { finish } from "@/lib/forms";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function runJobs() {
  "use server";
  await requirePlatformAdmin();
  let result;
  try {
    result = await processJobs({ webhooks: 1, outbound: 1 });
  } catch {
    finish(
      "/admin/etat",
      "Traitement indisponible. Vérifiez la configuration et les migrations.",
    );
  }
  finish(
    "/admin/etat",
    `${result.received} événement(s) traité(s), ${result.outbound} envoi(s) examiné(s).`,
  );
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  await requirePlatformAdmin();
  const { message } = await searchParams;
  const client = serviceDb();
  const [webhooks, outbound, email, expired] = await Promise.all([
    client
      .from("webhook_events")
      .select("id,provider,status,attempts,error_code,created_at")
      .in("status", ["pending", "failed", "dead", "processing"])
      .order("created_at", { ascending: false })
      .limit(30),
    client
      .from("message_outbox")
      .select("id,status,error_code,created_at")
      .in("status", ["queued", "failed", "unknown"])
      .order("created_at", { ascending: false })
      .limit(30),
    client
      .from("email_jobs")
      .select("id,status,attempts,created_at")
      .neq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(30),
    client
      .from("channel_credentials")
      .select("channel_id", { count: "exact", head: true })
      .lt("expires_at", new Date().toISOString()),
  ]);
  if (webhooks.error || outbound.error || email.error || expired.error)
    throw new Error("État technique indisponible. Vérifiez les migrations.");
  return (
    <main className="public-section">
      <div className="row between">
        <Brand />
        <Link className="btn secondary" href="/admin">
          Comptes
        </Link>
        <Link className="btn secondary" href="/admin/abonnements">
          Abonnements
        </Link>
      </div>
      <h1 style={{ marginTop: 30 }}>État technique et reprises</h1>
      <Notice message={message} />
      <section className="card">
        <h2>Configuration serveur</h2>
        {[
          ["Modèle IA", aiConfigured()],
          ["Instagram", metaReady("instagram")],
          ["WhatsApp", metaReady("whatsapp")],
          [
            "Emails",
            Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
          ],
          ["Ordonnanceur", Boolean(process.env.CRON_SECRET)],
        ].map(([label, ready]) => (
          <p key={String(label)}>
            {String(label)} :{" "}
            <span className={`badge ${ready ? "green" : "amber"}`}>
              {ready ? "Variables présentes" : "Non configuré"}
            </span>
          </p>
        ))}
        <p>
          {expired.count || 0} jeton(s) avec une échéance dépassée. Aucune clé,
          aucun token et aucun contenu client n’est affiché ici.
        </p>
        <form action={runJobs}>
          <PendingButton>Traiter un lot en attente</PendingButton>
        </form>
        <p style={{ marginTop: 16, fontSize: 12 }}>
          Le cron livré s’exécute une fois par jour. Pour les reprises et
          réponses automatiques en production, configurez un ordonnanceur
          fréquent autorisé par votre hébergement. Les webhooks rendent les
          messages visibles immédiatement ; les traitements IA et pièces jointes
          restent asynchrones.
        </p>
      </section>
      <div className="grid cols3" style={{ marginTop: 20 }}>
        <section className="card">
          <h2>Webhooks · 30 derniers à surveiller</h2>
          {webhooks.data?.length ? (
            webhooks.data.map((e) => (
              <p key={e.id}>
                {e.provider} · {e.status} · {e.attempts} essai(s)
                <br />
                <small>
                  {e.error_code || "En attente"} ·{" "}
                  {new Date(e.created_at).toLocaleString("fr-MA", {
                    timeZone: "Africa/Casablanca",
                  })}
                </small>
              </p>
            ))
          ) : (
            <p>Aucun événement en attente ou en échec.</p>
          )}
        </section>
        <section className="card">
          <h2>Envois · 30 derniers à surveiller</h2>
          {outbound.data?.length ? (
            outbound.data.map((e) => (
              <p key={e.id}>
                {e.status}
                <br />
                <small>{e.error_code || "En attente"}</small>
              </p>
            ))
          ) : (
            <p>Aucun envoi à surveiller.</p>
          )}
          <small>
            Un état incertain n’est jamais renvoyé automatiquement. Vérifier le
            canal avant une nouvelle saisie.
          </small>
        </section>
        <section className="card">
          <h2>Emails · 30 derniers non envoyés</h2>
          {email.data?.length ? (
            email.data.map((e) => (
              <p key={e.id}>
                {e.status} · {e.attempts} essai(s)
                <br />
                <small>
                  {new Date(e.created_at).toLocaleString("fr-MA", {
                    timeZone: "Africa/Casablanca",
                  })}
                </small>
              </p>
            ))
          ) : (
            <p>Aucun email en attente.</p>
          )}
        </section>
      </div>
    </main>
  );
}
