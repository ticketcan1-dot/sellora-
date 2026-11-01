"use client";
import { MessageText } from "@/components/message-text";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Send, RotateCcw, ImagePlus } from "lucide-react";
import { saveSettings, simulate } from "./actions";
import type { AiSettings } from "./schema";
import { parseMad } from "@/domains/catalog/schema";
import { Notice } from "@/components/ui";
type Message = { role: string; content: string };
export function AssistantPanel({
  settings,
  responseMode,
  configured,
  canEdit,
  canSimulate,
  initialMessages,
  initialConversation,
}: {
  settings: AiSettings;
  responseMode: string;
  configured: boolean;
  canEdit: boolean;
  canSimulate: boolean;
  initialMessages: Message[];
  initialConversation?: string;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversation);
  const [paused, setPaused] = useState(settings.paused);
  const [imageName, setImageName] = useState("");
  function save(form: FormData) {
    start(async () => {
      const values = Object.fromEntries(form.entries());
      const result = await saveSettings({
        ...values,
        emoji: form.get("emoji") === "on",
        cod: form.get("cod") === "on",
        paused,
        checkout_enabled: form.get("checkout_enabled") === "on",
        checkout_delivery_minor: parseMad(
          String(form.get("checkout_delivery") || "0"),
        ),
        checkout_cities: String(form.get("checkout_cities") || "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      });
      setNotice(result.error || "Personnalisation enregistrée.");
      router.refresh();
    });
  }
  function pause() {
    start(async () => {
      const result = await saveSettings({ ...settings, paused: !paused });
      if (!result.error) setPaused(!paused);
      setNotice(
        result.error ||
          (!paused
            ? "Assistant mis en pause."
            : "Assistant réactivé selon le mode configuré dans les canaux."),
      );
      router.refresh();
    });
  }
  function send(form: FormData) {
    if (conversationId) form.set("conversation_id", conversationId);
    const text = String(form.get("message") || "");
    const file = form.get("image");
    start(async () => {
      try {
        const result = await simulate(form);
        if (result.conversationId) setConversationId(result.conversationId);
        if (result.error) {
          setNotice(result.error);
          router.refresh();
          return;
        }
        setMessages((m) => [
          ...m,
          {
            role: "user",
            content:
              text +
              (file instanceof File && file.size ? "\n[Image jointe]" : ""),
          },
          { role: "assistant", content: result.reply! },
        ]);
        setNotice(
          result.needsHuman
            ? "Résultat à clarifier ou à faire vérifier par un humain."
            : "Réponse calculée depuis votre catalogue.",
        );
        setImageName("");
        router.refresh();
      } catch {
        setNotice("La simulation a échoué. Vérifiez votre connexion.");
      }
    });
  }
  return (
    <div className="stack">
      <Notice message={notice} />
      {!configured && (
        <div className="notice warning" role="status">
          <strong>Modèle non configuré.</strong> Les réglages sont utilisables.
          Le chat et l’analyse d’images nécessitent un fournisseur multimodal et
          une configuration serveur.
        </div>
      )}
      <div className="grid cols2">
        <section className="card">
          <div className="row between">
            <h2>La voix de votre boutique</h2>
            <span className="badge">
              {paused
                ? "En pause"
                : responseMode === "automatic"
                  ? "Automatique activé"
                  : responseMode === "suggestion_only"
                    ? "Validation humaine"
                    : "Simulation uniquement"}
            </span>
          </div>
          <p>
            Vos politiques restent prioritaires. Les instructions ne peuvent
            changer les permissions, prix ou stocks.
          </p>
          <form action={save}>
            <fieldset
              disabled={!canEdit || pending}
              style={{ border: 0, padding: 0 }}
            >
              <div className="grid cols2">
                <label>
                  Nom de l’assistant
                  <input
                    name="name"
                    defaultValue={settings.name}
                    maxLength={60}
                    required
                  />
                </label>
                <label>
                  Ton
                  <select name="tone" defaultValue={settings.tone}>
                    <option value="chaleureux">Chaleureux</option>
                    <option value="professionnel">Professionnel</option>
                    <option value="concis">Concis</option>
                  </select>
                </label>
                <label>
                  Langue
                  <select name="language" defaultValue={settings.language}>
                    <option value="auto">Détection automatique</option>
                    <option value="fr">Français</option>
                    <option value="ar">العربية</option>
                    <option value="darija">الدارجة</option>
                  </select>
                </label>
                <label>
                  Adresse en français
                  <select name="address" defaultValue={settings.address}>
                    <option value="vous">Vouvoiement</option>
                    <option value="tu">Tutoiement</option>
                  </select>
                </label>
              </div>
              <label>
                <input
                  type="checkbox"
                  name="emoji"
                  defaultChecked={settings.emoji}
                />
                Utiliser un émoji d’accueil
              </label>
              {[
                ["hours", "Horaires", 1000],
                ["delivery", "Livraison et frais", 2000],
                ["returns", "Retours", 2000],
                ["discounts", "Remises autorisées", 1000],
                ["faq", "FAQ · une réponse autonome par ligne", 4000],
                ["instructions", "Préférences personnalisées", 4000],
                ["escalation", "Consigne de transfert humain", 1000],
              ].map(([key, label, max]) => (
                <label key={String(key)}>
                  {label}
                  <textarea
                    name={String(key)}
                    maxLength={Number(max)}
                    defaultValue={String(settings[key as keyof AiSettings])}
                    required={key === "escalation"}
                  />
                </label>
              ))}
              <details>
                <summary>Préparer des commandes avec l’assistant</summary>
                <p>
                  Une proposition concerne une seule variante non ambiguë. Le
                  client doit confirmer le récapitulatif et ses coordonnées sur
                  un lien privé ; aucun paiement n’est déclaré reçu.
                </p>
                <label>
                  <input
                    name="checkout_enabled"
                    type="checkbox"
                    defaultChecked={settings.checkout_enabled}
                  />
                  Autoriser les liens de commande préparés par l’IA
                </label>
                <label>
                  Forfait de livraison de ces propositions (MAD)
                  <input
                    name="checkout_delivery"
                    defaultValue={(
                      settings.checkout_delivery_minor / 100
                    ).toFixed(2)}
                    pattern="[0-9]+([.,][0-9]{1,2})?"
                    inputMode="decimal"
                  />
                </label>
                <label>
                  Villes desservies, séparées par des virgules
                  <input
                    name="checkout_cities"
                    maxLength={4000}
                    defaultValue={settings.checkout_cities.join(", ")}
                  />
                </label>
                <small>
                  Sans liste de villes, vous déclarez que ce forfait s’applique
                  à toutes les villes. Les frais sont imposés par le serveur,
                  jamais inventés par l’IA. Le mode de réponse doit être activé
                  dans les canaux.
                </small>
              </details>
              <label>
                <input
                  type="checkbox"
                  name="cod"
                  defaultChecked={settings.cod}
                />
                Paiement à la livraison proposé
              </label>
              <button className="btn" disabled={!canEdit || pending}>
                {pending
                  ? "Enregistrement…"
                  : "Sauvegarder la personnalisation"}
              </button>
            </fieldset>
          </form>
          {canEdit && (
            <button
              className={`btn ${paused ? "secondary" : "danger"}`}
              onClick={pause}
              disabled={pending}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
              {paused
                ? "Réactiver l’assistant"
                : "Arrêt immédiat de l’assistant"}
            </button>
          )}
          {!canEdit && (
            <small>
              Seuls les propriétaires et administrateurs modifient les réglages.
            </small>
          )}
        </section>
        <section className="card" style={{ alignSelf: "start" }}>
          <div className="row between">
            <h2>Le bac à sable</h2>
            <span className="badge amber">SIMULATION</span>
          </div>
          <p>
            Aucun message Instagram ou WhatsApp n’est envoyé. Les essais sont
            exclus de vos statistiques commerciales.
          </p>
          <div
            className="chat"
            role="log"
            aria-live="polite"
            aria-label="Conversation de simulation"
          >
            {!messages.length && (
              <div className="empty">
                <h3>Essayez comme un client.</h3>
                <p>
                  « salam wach had bague mazal kayna ? »<br />« بغيت هاد الكوليي
                  بالذهبي »<br />« prix dyal had collier svp »
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                className={`bubble ${m.role === "user" ? "user" : "assistant"}`}
                key={i}
                dir="auto"
              >
                <small
                  style={{ color: m.role === "user" ? "#e1e7ff" : undefined }}
                >
                  {m.role === "user" ? "Vous · test" : "Assistant · simulation"}
                </small>
                <div>
                  <MessageText text={m.content} />
                </div>
              </div>
            ))}
            {pending && <p role="status">Traitement en cours…</p>}
          </div>
          <form action={send} key={messages.length} style={{ marginTop: 16 }}>
            <label>
              Votre message
              <textarea
                name="message"
                maxLength={3000}
                placeholder="Posez une question sur votre catalogue…"
                disabled={!configured || paused || !canSimulate || pending}
              />
            </label>
            <label>
              <span className="row">
                <ImagePlus size={15} />
                Photo ou capture (5 Mo maximum)
              </span>
              <input
                type="file"
                name="image"
                accept="image/jpeg,image/png,image/webp"
                disabled={!configured || paused || !canSimulate || pending}
                onChange={(e) => setImageName(e.target.files?.[0]?.name || "")}
              />
            </label>
            {imageName && (
              <small>
                {imageName} · supprimée de la mémoire après traitement ; non
                stockée par Sellora.
              </small>
            )}
            <div className="row">
              <button
                className="btn"
                disabled={!configured || paused || !canSimulate || pending}
              >
                <Send size={15} />
                {pending ? "Analyse…" : "Tester la réponse"}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={pending}
                onClick={() => {
                  setMessages([]);
                  setConversationId(undefined);
                  setNotice(
                    "Nouvelle simulation. L’historique précédent reste enregistré.",
                  );
                }}
              >
                <RotateCcw size={15} />
                Nouveau test
              </button>
            </div>
          </form>
          <p style={{ fontSize: 11, marginTop: 20 }}>
            Recherche limitée aux 100 derniers produits actifs ; comparaison
            visuelle sur 12 photos présélectionnées au maximum. Les
            correspondances visuelles demandent toujours confirmation. Les
            textes de politiques sont restitués dans la langue où vous les avez
            renseignés.
          </p>
        </section>
      </div>
    </div>
  );
}
