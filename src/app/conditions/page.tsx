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
        Le service comprend boutiques, catalogue, clients, commandes,
        conversations et assistant. Les connexions Meta exigent configuration et
        autorisations officielles. Les encaissements sont enregistrés
        manuellement ; aucun prestataire de paiement en ligne n’est activé.
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
        L’essai IA dure 7 jours à compter de la création de la boutique, avec
        des limites quotidiennes visibles dans la facturation (50 tentatives par
        défaut pour Starter). Les tentatives échouées comptent dans la limite.
        Les tarifs futurs, engagements de service, règles de suspension et
        modalités de résiliation doivent être définis avant la
        commercialisation. Une demande de formule ne déclenche aucun paiement.
        Une activation manuelle doit être convenue avec l’administrateur.
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
