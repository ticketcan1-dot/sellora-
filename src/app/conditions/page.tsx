import { Brand } from "@/components/ui";
export default function Page() {
  return (
    <main className="legal">
      <Brand />
      <h1 style={{ marginTop: 40 }}>Conditions d’utilisation</h1>
      <div className="notice warning">
        Version pilote, à compléter juridiquement. Ce document ne constitue pas
        des conditions commerciales définitives.
      </div>
      <h2>Service pilote</h2>
      <p>
        La première version comprend boutiques, catalogue et simulation
        d’assistant. Les intégrations Meta et paiements ne sont pas actifs.
        Aucun résultat de vente ou d’identification visuelle n’est garanti.
      </p>
      <h2>Responsabilités</h2>
      <p>
        Le commerçant renseigne des prix, stocks et politiques exacts et dispose
        des droits sur les images fournies. Il valide les correspondances
        incertaines et les réponses avant toute utilisation commerciale.
      </p>
      <h2>Essai et coûts</h2>
      <p>
        L’essai IA dure 7 jours à compter de la création de la boutique, avec 50
        tentatives quotidiennes par défaut. Les tentatives échouées comptent
        dans la limite. Les tarifs futurs, engagements de service, règles de
        suspension et modalités de résiliation doivent être définis avant la
        commercialisation. Aucun paiement n’est déclenché dans cette version.
      </p>
      <h2>Éléments juridiques à compléter</h2>
      <p>
        Éditeur, contact, juridiction, propriété intellectuelle, disponibilité,
        support, responsabilité et traitement des réclamations doivent être
        validés pour le marché visé.
      </p>
    </main>
  );
}
