import { Brand } from "@/components/ui";
export default function Page() {
  return (
    <main className="legal">
      <Brand />
      <h1 style={{ marginTop: 40 }}>Confidentialité</h1>
      <div className="notice warning">
        Document provisoire à compléter et faire valider juridiquement avant
        commercialisation. Aucune certification de conformité n’est revendiquée.
      </div>
      <h2>Données et finalités</h2>
      <p>
        Sellora utilise les données de compte, de boutique, de catalogue et de
        conversation, de clients et de commandes pour fournir le service. Les
        données sont isolées par boutique ; son équipe autorisée peut consulter
        les conversations et commandes enregistrées.
      </p>
      <h2>Prestataires et images</h2>
      <p>
        Supabase héberge l’authentification, la base et les fichiers. Lors d’une
        simulation, le fournisseur IA configuré reçoit le message, un historique
        limité, des références de catalogue et éventuellement des images. Les
        images reçues par les canaux ou le simulateur de webhook sont conservées
        dans un stockage privé. Les images du bac à sable IA direct sont
        traitées en mémoire. Le fournisseur IA et Meta appliquent leurs propres
        conditions de traitement et de conservation.
      </p>
      <h2>Informations à compléter avant lancement</h2>
      <p>
        Identité et contact du responsable de traitement, sous-traitants exacts,
        pays et régions d’hébergement, durées de conservation, transferts et
        procédures d’export et de suppression doivent être publiés. Les
        démarches applicables au Maroc, notamment la loi 09-08 et la CNDP,
        nécessitent une vérification professionnelle.
      </p>
      <h2>Cookies et contrôle</h2>
      <p>
        Les cookies de session et de sélection de boutique sont nécessaires au
        fonctionnement. Aucun outil publicitaire n’est intégré. Le propriétaire
        peut exporter les données de sa boutique, anonymiser un client,
        appliquer la rétention aux conversations closes ou supprimer sa boutique
        depuis les paramètres. Les pièces financières nécessitent une durée
        légale adaptée. Pour vos demandes personnelles, contactez
        l’administrateur du déploiement ; ses coordonnées restent à renseigner.
      </p>
    </main>
  );
}
