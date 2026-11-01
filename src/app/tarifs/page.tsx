import Link from "next/link";
import { Brand } from "@/components/ui";
export default function Page() {
  return (
    <>
      <header className="public-nav">
        <Brand />
        <Link href="/connexion">Connexion</Link>
      </header>
      <main className="public-section">
        <h1>Un lancement transparent.</h1>
        <p>
          Tarifs provisoires en cours de définition. Aucun paiement en ligne ni
          prélèvement récurrent n’est activé.
        </p>
        <div className="grid cols3">
          {["Starter", "Business", "Premium"].map((name) => (
            <section className="card" key={name}>
              <span className="eyebrow">{name}</span>
              <h2 style={{ marginTop: 20 }}>Prix à définir</h2>
              <p>
                Les fonctionnalités commerciales et quotas propres à cette
                formule seront précisés avant sa mise en vente.
              </p>
              <span className="badge">Non commercialisé</span>
            </section>
          ))}
        </div>
        <section className="card" style={{ marginTop: 24 }}>
          <h2>Essai du pilote</h2>
          <p>
            7 jours à partir de la création de la boutique et 50 tentatives IA
            par jour (UTC). Un fournisseur multimodal configuré est nécessaire.
            Les coûts de modèle et d’hébergement dépendent des fournisseurs et
            de l’utilisation.
          </p>
          <Link className="btn" href="/inscription">
            Créer une boutique
          </Link>
        </section>
      </main>
    </>
  );
}
