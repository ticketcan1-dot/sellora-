import Link from "next/link";
import { authenticate } from "@/domains/auth/actions";
import { Brand, Notice } from "./ui";
import { PendingButton } from "./pending-button";
export function AuthForm({
  mode,
  message,
}: {
  mode: "signin" | "signup" | "reset";
  message?: string;
}) {
  const title =
    mode === "signup"
      ? "Votre commerce, un nouvel élan."
      : mode === "reset"
        ? "Retrouvons votre accès."
        : "Heureux de vous retrouver.";
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Brand />
        <div>
          <span className="badge">PENSÉ POUR VOTRE COMMERCE</span>
          <h1>
            Plus proche de vos clients.
            <br />
            Plus libre au quotidien.
          </h1>
          <p>
            Votre catalogue et votre assistant, réunis dans un espace simple et
            sécurisé.
          </p>
        </div>
        <small style={{ color: "#cbd5ff" }}>
          Sellora AI · Conçu pour les commerçants au Maroc
        </small>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <Brand />
          <h1>{title}</h1>
          <p>
            {mode === "signup"
              ? "Créez votre compte. Un administrateur doit autoriser votre accès avant l’ouverture de votre boutique."
              : mode === "reset"
                ? "Recevez un lien de récupération par email."
                : "Connectez-vous pour retrouver votre boutique."}
          </p>
          <Notice message={message} />
          <form action={authenticate}>
            <input type="hidden" name="mode" value={mode} />
            <label>
              Adresse email
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="vous@boutique.ma"
              />
            </label>
            {mode !== "reset" && (
              <label>
                Mot de passe
                <input
                  type="password"
                  name="password"
                  minLength={mode === "signup" ? 12 : 1}
                  maxLength={128}
                  required
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                />
                {mode === "signup" && <small>12 caractères minimum.</small>}
              </label>
            )}
            <PendingButton>
              {mode === "signup"
                ? "Créer mon compte"
                : mode === "reset"
                  ? "Envoyer le lien"
                  : "Se connecter"}
            </PendingButton>
          </form>
          <p style={{ marginTop: 24 }}>
            {mode === "signin" ? (
              <>
                <Link href="/mot-de-passe">Mot de passe oublié ?</Link>
                <br />
                Pas encore de compte ?{" "}
                <Link href="/inscription">Créer un compte</Link>
              </>
            ) : (
              <Link href="/connexion">Retour à la connexion</Link>
            )}
          </p>
          {mode === "signup" && (
            <small>
              En créant votre compte, vous acceptez les{" "}
              <Link href="/conditions">conditions</Link> et la{" "}
              <Link href="/confidentialite">politique de confidentialité</Link>,
              versions provisoires.
            </small>
          )}
        </div>
      </main>
    </div>
  );
}
