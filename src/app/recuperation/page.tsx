import { updatePassword } from "@/domains/auth/actions";
import { authenticatedSession } from "@/domains/tenants/access";
import { Brand, Notice } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  await authenticatedSession();
  const { message } = await searchParams;
  return (
    <main className="legal">
      <Brand />
      <h1 style={{ marginTop: 30 }}>Nouveau mot de passe</h1>
      <Notice message={message} />
      <form action={updatePassword}>
        <label>
          Mot de passe
          <input
            type="password"
            name="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <PendingButton>Enregistrer</PendingButton>
      </form>
    </main>
  );
}
