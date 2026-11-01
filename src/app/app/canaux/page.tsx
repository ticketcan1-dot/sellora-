import { simulateWebhook } from "@/domains/integrations/simulator-action";
import Link from "next/link";
import { Camera, MessageCircle } from "lucide-react";
import { tenant } from "@/domains/tenants/access";
import { PageHead, Notice } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { metaReady } from "@/domains/integrations/meta-api";
import { WhatsAppButton } from "@/domains/integrations/whatsapp-button";
import {
  disconnectChannel,
  setAssistantMode,
  saveSocialAsset,
  deleteSocialAsset,
} from "@/domains/integrations/actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { client, organization, role } = await tenant();
  const { message } = await searchParams;
  const manager = ["owner", "admin"].includes(role);
  if (!manager)
    return (
      <>
        <PageHead
          title="Canaux connectés"
          description="Seuls le propriétaire et les administrateurs de la boutique peuvent gérer les connexions."
        />
      </>
    );
  const [
    { data: channels, error },
    { data: settings, error: se },
    { data: products, error: pe },
    { data: assets, error: ae },
  ] = await Promise.all([
    client
      .from("channels")
      .select("id,provider,status,display_name,last_error")
      .eq("organization_id", organization.id),
    client
      .from("ai_settings")
      .select("mode,paused")
      .eq("organization_id", organization.id)
      .single(),
    client
      .from("products")
      .select("id,name")
      .eq("organization_id", organization.id)
      .order("name")
      .limit(1000),
    client
      .from("social_media_assets")
      .select("id,provider,external_id,products(name)")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (error || se || pe || ae)
    throw new Error("Canaux indisponibles. Vérifiez la migration 006.");
  const names: Record<string, string> = {
    non_configured: "Non configuré",
    pending_approval: "Autorisation en attente",
    connected: "Connecté",
    error: "Erreur — reconnecter",
    revoked: "Déconnecté",
  };
  return (
    <div className="stack">
      <PageHead
        title="Vos canaux officiels"
        description="Instagram professionnel et WhatsApp Business, sans collecte de mot de passe social."
      />
      <Notice message={message} />
      {!metaReady("instagram") && !metaReady("whatsapp") && (
        <div className="notice warning">
          API Meta non configurées. Aucun canal n’est déclaré connecté sans
          vérification auprès de Meta. Les webhooks et l’inbox restent inactifs
          tant que les accès officiels ne sont pas autorisés.
        </div>
      )}
      <div className="grid cols2">
        {(["instagram", "whatsapp"] as const).map((provider) => {
          const channel = channels?.find((c) => c.provider === provider);
          const ready = metaReady(provider);
          const Icon = provider === "instagram" ? Camera : MessageCircle;
          return (
            <section className="card" key={provider}>
              <div className="row between">
                <Icon size={28} color="#4058d5" />
                <span
                  className={`badge ${channel?.status === "connected" ? "green" : "amber"}`}
                >
                  {channel?.status === "connected" && !ready
                    ? "Configuration serveur inactive"
                    : names[channel?.status || "non_configured"]}
                </span>
              </div>
              <h2 style={{ marginTop: 24 }}>
                {provider === "instagram"
                  ? "Instagram professionnel"
                  : "WhatsApp Business"}
              </h2>
              <p>
                {channel?.display_name || "Aucun compte vérifié"}
                {channel?.last_error && (
                  <>
                    <br />
                    {channel.last_error}
                  </>
                )}
              </p>
              <p>
                Autorisation minimale pour recevoir vos messages et répondre
                dans les fenêtres autorisées. Les pièces jointes et stories
                dépendent des données réellement fournies par Meta.
              </p>
              {provider === "instagram" ? (
                ready ? (
                  <Link
                    prefetch={false}
                    className="btn"
                    href="/api/meta/instagram/start"
                  >
                    Connecter Instagram
                  </Link>
                ) : (
                  <button disabled className="btn secondary">
                    Connexion Instagram non configurée
                  </button>
                )
              ) : (
                <WhatsAppButton enabled={ready} />
              )}
              <p style={{ fontSize: 12, marginTop: 18 }}>
                Connexion via les écrans officiels Meta, sous réserve
                d’éligibilité, de permissions et de revue de l’application.
              </p>
              {channel && ["connected", "error"].includes(channel.status) && (
                <form action={disconnectChannel}>
                  <input name="id" type="hidden" value={channel.id} />
                  <PendingButton className="btn danger small">
                    Déconnecter et supprimer le jeton local
                  </PendingButton>
                </form>
              )}
            </section>
          );
        })}
      </div>
      <section className="card">
        <h2>Mode de réponse de l’assistant</h2>
        <p>
          {settings.paused
            ? "L’assistant est actuellement en pause globale."
            : "Les conversations peuvent également être mises en pause individuellement."}
        </p>
        <form action={setAssistantMode}>
          <label>
            Mode
            <select name="mode" defaultValue={settings.mode}>
              <option value="simulation">Simulation uniquement</option>
              <option value="suggestion_only">
                Suggestions — l’équipe valide chaque envoi
              </option>
              <option value="automatic">
                Automatique — réponses certaines et autorisées uniquement
              </option>
            </select>
          </label>
          <label>
            <input type="checkbox" name="explicit" />
            J’active explicitement les réponses automatiques sur les canaux
            connectés, avec droits actifs et reprise humaine en cas de doute.
          </label>
          <PendingButton>Enregistrer le mode</PendingButton>
        </form>
        <small>
          Une image, un prix devenu obsolète, une incertitude ou une fenêtre
          fermée impose un blocage ou une validation humaine. Un envoi incertain
          n’est jamais renvoyé automatiquement.
        </small>
      </section>
      <section className="card">
        <h2>Associer une publication à vos produits</h2>
        <p>
          Utilisez un identifiant de story ou de publication réellement
          accessible via votre API Meta. Une URL partagée ne garantit pas que
          cet identifiant soit fourni au webhook.
        </p>
        <form action={saveSocialAsset} className="grid cols3">
          <label>
            Canal
            <select name="provider">
              <option value="instagram">Instagram</option>
            </select>
          </label>
          <label>
            Identifiant officiel
            <input name="external_id" maxLength={200} required />
          </label>
          <label>
            Produit
            <select name="product_id" required>
              {products?.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <PendingButton>Associer le produit</PendingButton>
          </div>
        </form>
        {assets?.map((a) => (
          <div
            key={a.id}
            className="row between"
            style={{ padding: "12px 0", borderTop: "1px solid var(--border)" }}
          >
            <span>
              {a.provider} · {a.external_id} →{" "}
              {(a.products as unknown as { name: string })?.name}
            </span>
            <form action={deleteSocialAsset}>
              <input name="id" type="hidden" value={a.id} />
              <PendingButton className="btn danger small">
                Retirer
              </PendingButton>
            </form>
          </div>
        ))}
      </section>
      <section className="card">
        <h2>Simulateur de message entrant</h2>
        <div className="notice warning">
          Bac à sable isolé : aucune connexion Meta réelle, aucune statistique
          commerciale et aucun envoi externe.
        </div>
        <form action={simulateWebhook}>
          <label>
            Scénario de canal
            <select name="provider">
              <option value="whatsapp">WhatsApp · simulation</option>
              <option value="instagram">Instagram · simulation</option>
            </select>
          </label>
          <label>
            Message client de test
            <textarea
              name="content"
              maxLength={3000}
              required
              defaultValue="salam wach had bague mazal kayna ?"
            />
          </label>
          <label>
            Image ou capture de test (facultatif)
            <input
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
            />
          </label>
          <PendingButton className="btn secondary">
            Créer un fil de simulation
          </PendingButton>
        </form>
      </section>
      <section className="card">
        <h2>Votre contrôle sur les données</h2>
        <p>
          Les jetons sont chiffrés côté serveur et ne sont jamais affichés ici.
          Vous pouvez déconnecter le canal et révoquer Sellora dans les
          paramètres Meta. Les traitements sont journalisés avec un minimum de
          données.
        </p>
        <Link href="/app/aide" className="btn secondary">
          Configuration et limites
        </Link>
      </section>
    </div>
  );
}
