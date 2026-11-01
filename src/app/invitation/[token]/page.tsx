import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand, Notice } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import { acceptInvitation } from "@/domains/tenants/team-actions";
export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  const { message } = await searchParams;
  return (
    <main className="legal">
      <Brand />
      <section className="card" style={{ marginTop: 32 }}>
        <h1>Rejoindre une équipe Sellora</h1>
        <p>
          Connectez-vous avec l’adresse email destinataire de l’invitation.
          Votre compte doit être confirmé et approuvé par l’administrateur de la
          plateforme.
        </p>
        <Notice message={message} />
        <form action={acceptInvitation}>
          <input type="hidden" name="token" value={token} />
          <PendingButton>Accepter l’invitation</PendingButton>
        </form>
        <p style={{ marginTop: 20 }}>
          <Link
            href={
              "/connexion?next=" + encodeURIComponent("/invitation/" + token)
            }
          >
            Se connecter
          </Link>{" "}
          · <Link href="/inscription">Créer un compte</Link>
        </p>
        <small>
          Si votre compte est en attente d’approbation, revenez sur ce lien une
          fois approuvé. Le lien expire après sept jours et ne peut être utilisé
          qu’une fois.
        </small>
      </section>
    </main>
  );
}
