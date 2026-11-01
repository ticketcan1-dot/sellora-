import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Languages,
  Package,
  ScanLine,
  Check,
} from "lucide-react";
import { Brand } from "@/components/ui";
export default function Home() {
  return (
    <>
      <header className="public-nav">
        <Brand />
        <nav className="row">
          <Link className="hide-mobile" href="/tarifs">
            Tarifs
          </Link>
          <Link href="/connexion">Connexion</Link>
          <Link className="btn" href="/inscription">
            Commencer <ArrowRight size={15} />
          </Link>
        </nav>
      </header>
      <main>
        <section className="hero">
          <span className="badge">
            <span>✦</span> Votre nouvelle façon de vendre
          </span>
          <h1>
            Votre boutique avance.
            <br />
            <span style={{ color: "var(--primary)" }}>
              Votre assistant suit.
            </span>
          </h1>
          <p>
            Réunissez vos produits et testez un assistant qui comprend vos
            clients en français, arabe et darija.
          </p>
          <div className="row">
            <Link href="/inscription" className="btn">
              Créer ma boutique <ArrowRight size={16} />
            </Link>
            <Link href="#fonctionnement" className="btn secondary">
              Découvrir Sellora
            </Link>
          </div>
          <p style={{ fontSize: 12 }}>
            Essai IA de 7 jours · Aucun paiement en ligne activé
          </p>
        </section>
        <section className="public-section grid cols3" id="fonctionnement">
          {[
            [
              Package,
              "Un catalogue qui vous ressemble",
              "Photos, tailles, couleurs, prix en dirhams et stocks : une source fiable pour votre commerce.",
            ],
            [
              Languages,
              "Une conversation naturelle",
              "Testez les échanges en français, arabe et darija, même lorsque vos clients mélangent les langues.",
            ],
            [
              ScanLine,
              "Une photo pour se comprendre",
              "Analysez une image et retrouvez des produits candidats, avec clarification en cas de doute.",
            ],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof Package;
            return (
              <article className="card" key={String(title)}>
                <I size={26} color="#4058d5" />
                <h2 style={{ marginTop: 22 }}>{String(title)}</h2>
                <p>{String(body)}</p>
              </article>
            );
          })}
        </section>
        <section className="public-section grid cols2">
          <div>
            <span className="eyebrow">Votre boutique, vos règles</span>
            <h1 style={{ marginTop: 16 }}>
              Gardez la main,
              <br />à chaque étape.
            </h1>
            <p>
              Définissez le ton et les politiques de votre assistant. Essayez
              vos scénarios dans un espace de simulation avant toute connexion à
              vos canaux.
            </p>
            <p>
              <ShieldCheck
                size={18}
                style={{ display: "inline", verticalAlign: "middle" }}
              />{" "}
              Données séparées entre les boutiques.
            </p>
          </div>
          <div className="card">
            <h2>Un démarrage guidé</h2>
            {[
              "Créez votre boutique",
              "Ajoutez vos premiers produits",
              "Personnalisez et testez votre assistant",
              "Préparez vos canaux officiels",
            ].map((s, i) => (
              <div className="step" key={s}>
                <span className="step-number">{i + 1}</span>
                {s}
                <Check
                  size={15}
                  color="#4058d5"
                  style={{ marginLeft: "auto" }}
                />
              </div>
            ))}
            <small>
              Instagram et WhatsApp : connexions officielles soumises aux accès
              et autorisations Meta. Aucun compte n’est connecté
              automatiquement.
            </small>
          </div>
        </section>
        <section className="public-section">
          <h2>Vos questions, simplement.</h2>
          {[
            [
              "Sellora envoie-t-il déjà des messages ?",
              "Après configuration et autorisation Meta, vous pouvez connecter vos comptes officiels. Le mode suggestion permet de valider les réponses ; le mode automatique exige une activation explicite. Le bac à sable fonctionne séparément.",
            ],
            [
              "Que se passe-t-il sans fournisseur IA ?",
              "Votre boutique et votre catalogue restent disponibles. Le simulateur indique que le modèle n’est pas configuré.",
            ],
            [
              "L’assistant peut-il inventer un stock ?",
              "Les références, prix et stocks affichés proviennent de votre catalogue. Une recherche incertaine demande une clarification.",
            ],
          ].map(([q, a]) => (
            <details className="card" key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </main>
      <footer className="public-footer">
        <div className="row" style={{ justifyContent: "center" }}>
          <Brand />
          <Link href="/confidentialite">Confidentialité</Link>
          <Link href="/conditions">Conditions</Link>
        </div>
      </footer>
    </>
  );
}
