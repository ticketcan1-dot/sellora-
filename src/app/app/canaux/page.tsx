import { Camera, MessageCircle, LockKeyhole, ExternalLink } from "lucide-react";
import { tenant } from "@/domains/tenants/access";
import { PageHead } from "@/components/ui";
export default async function Page() {
  await tenant();
  return (
    <>
      <PageHead
        title="Vos canaux"
        description="Préparez votre future messagerie, avec les API officielles uniquement."
      />
      <div className="notice warning">
        Connexions non disponibles dans cette livraison. Aucun compte social
        n’est connecté, aucune conversation réelle n’est synchronisée et aucun
        message n’est envoyé.
      </div>
      <div className="grid cols2">
        {[
          [
            Camera,
            "Instagram professionnel",
            "Comptes professionnels éligibles, autorisations et revue Meta requises.",
            "https://developers.facebook.com/docs/instagram-platform/",
          ],
          [
            MessageCircle,
            "WhatsApp Business",
            "Numéro professionnel, opt-in et règles de fenêtres et modèles approuvés.",
            "https://developers.facebook.com/docs/whatsapp/cloud-api/",
          ],
        ].map(([Icon, title, body, url]) => {
          const I = Icon as typeof Camera;
          return (
            <section className="card" key={String(title)}>
              <div className="row between">
                <I color="#4058d5" size={28} />
                <span className="badge amber">Non configuré</span>
              </div>
              <h2 style={{ marginTop: 24 }}>{String(title)}</h2>
              <p>{String(body)}</p>
              <button className="btn secondary" disabled>
                <LockKeyhole size={14} />
                Connexion à venir
              </button>
              <p style={{ fontSize: 12, marginTop: 20 }}>
                Sellora ne vous demandera jamais votre mot de passe de réseau
                social.
              </p>
              <a
                href={String(url)}
                target="_blank"
                rel="noopener noreferrer"
                className="row muted"
              >
                Documentation officielle <ExternalLink size={13} />
              </a>
            </section>
          );
        })}
      </div>
      <section className="card" style={{ marginTop: 24 }}>
        <h2>Avant une connexion réelle</h2>
        <p>
          Les prochaines étapes incluront le consentement, les permissions
          minimales, les signatures des webhooks, les reprises sur échec et la
          déconnexion. La disponibilité des stories, publications et pièces
          jointes dépendra des données effectivement accessibles via Meta.
        </p>
        <small>
          Les interfaces techniques sont préparées. L’approbation et le
          fonctionnement des intégrations ne sont pas acquis.
        </small>
      </section>
    </>
  );
}
