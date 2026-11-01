import Link from "next/link";
import { PageHead } from "@/components/ui";
import { tenant } from "@/domains/tenants/access";
import { configured, aiConfigured } from "@/lib/config";
import { metaReady } from "@/domains/integrations/meta-api";
export default async function Page() {
  await tenant();
  const state = [
    ["Base Supabase", configured()],
    ["Modèle IA", aiConfigured()],
    ["Instagram officiel", metaReady("instagram")],
    ["WhatsApp officiel", metaReady("whatsapp")],
    [
      "Emails transactionnels",
      Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    ],
    ["Ordonnanceur", Boolean(process.env.CRON_SECRET)],
  ] as const;
  return (
    <div className="stack">
      <PageHead
        title="Aide et démarrage"
        description="Les étapes pour gérer votre boutique, avec des états de configuration transparents."
      />
      <section className="card">
        <h2>Configuration du déploiement</h2>
        {state.map(([name, ready]) => (
          <div
            className="row between"
            key={name}
            style={{
              padding: "12px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span>{name}</span>
            <span className={`badge ${ready ? "green" : "amber"}`}>
              {ready
                ? "Variables présentes — validation réelle nécessaire"
                : "Non configuré"}
            </span>
          </div>
        ))}
        <p style={{ marginTop: 16 }}>
          La présence des variables ne garantit pas les droits fournisseurs ou
          l’approbation Meta. L’état connecté d’un canal exige une vérification
          réussie auprès de son API.
        </p>
      </section>
      {[
        [
          "Comment commencer ?",
          "Ajoutez vos produits et variantes, puis testez l’assistant. Créez une fiche client avec consentement pour les commandes manuelles, ou préparez un lien privé que le client confirme lui-même.",
        ],
        [
          "Pourquoi mon compte est-il en attente ?",
          "La plateforme exige la confirmation de votre email et l’approbation par l’administrateur global. Une session ouverte sur la page d’attente passe automatiquement à l’espace après approbation.",
        ],
        [
          "Pourquoi une commande ne réduit-elle pas encore le stock ?",
          "Un brouillon ne réserve pas le stock. La confirmation explicite du client déclenche la vérification et la réservation en transaction. Une simulation ne réduit jamais le stock réel.",
        ],
        [
          "Comment distinguer confirmation et paiement ?",
          "Une commande confirmée est un accord de commande, pas un paiement. Seul un encaissement documenté saisi par un propriétaire ou administrateur, ou une preuve fiable de prestataire, peut solder la commande. Aucun paiement en ligne n’est actif par défaut.",
        ],
        [
          "Comment obtenir une réponse IA ?",
          "L’administrateur du déploiement doit configurer AI_API_KEY et AI_MODEL pour un fournisseur multimodal compatible. Sans fournisseur, la personnalisation reste possible et aucun résultat fictif n’est produit.",
        ],
        [
          "Comment fonctionne la reconnaissance d’images ?",
          "Les photos sont validées et comparées à des candidats de votre catalogue. Le repli multimodal examine un sous-ensemble limité ; une ressemblance demande toujours confirmation. Un identifiant officiel associé est privilégié lorsqu’il est réellement présent.",
        ],
        [
          "Pourquoi un message est-il bloqué ?",
          "Le canal doit être connecté et autorisé, les droits actifs et la fenêtre de 24 heures ouverte. Les contenus non pris en charge, l’expiration du jeton ou un envoi incertain imposent une reprise humaine. Aucun renvoi automatique n’est effectué si le fournisseur a pu accepter le message avant une panne.",
        ],
        [
          "Comment connecter Instagram ou WhatsApp ?",
          "L’administrateur technique configure une application Meta éligible, la version Graph et ses permissions, les callbacks, le webhook signé, la clé de chiffrement et le parcours officiel. Le commerçant autorise ensuite son compte dans les écrans Meta. Aucun mot de passe social n’est demandé par Sellora.",
        ],
        [
          "Comment se déroulent les abonnements ?",
          "L’essai IA et messagerie dure sept jours. Les quotas sont appliqués côté serveur. Sans prestataire de paiement activé, l’administrateur peut accorder une formule pour une durée définie, explicitement en mode manuel.",
        ],
        [
          "Comment exporter ou effacer mes données ?",
          "Le propriétaire peut exporter les données et supprimer la boutique dans les paramètres. La conservation efface les textes anciens de conversations closes. Les historiques comptables nécessitent une revue des obligations applicables ; aucune conformité juridique automatique n’est garantie.",
        ],
      ].map(([q, a]) => (
        <details className="card" key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
      <section className="card">
        <h2>Un problème technique ?</h2>
        <p>
          Communiquez à l’administrateur la page, l’heure et la référence de
          commande ou conversation. Ne transmettez jamais de mot de passe, jeton
          Meta, clé API ou coordonnées clients dans un canal public.
        </p>
        <div className="row">
          <Link href="/app/parametres" className="btn secondary">
            Paramètres
          </Link>
          <Link href="/confidentialite" className="btn secondary">
            Confidentialité
          </Link>
        </div>
      </section>
    </div>
  );
}
