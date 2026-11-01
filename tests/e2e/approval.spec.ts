import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
test("compte en attente → approbation /admin → ouverture automatique → retrait d’accès", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  test.skip(
    process.env.SELLORA_E2E_LIVE !== "true" ||
      !process.env.ADMIN_EMAIL ||
      !process.env.ADMIN_PASSWORD,
    "Requires an isolated migrated Supabase test project and configured platform admin",
  );
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const email = `sellora-approval-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomUUID() + "Aa1!";
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const userId = data.user!.id;
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  try {
    await page.goto("/connexion");
    await page.getByLabel("Adresse email").fill(email);
    await page.getByLabel("Mot de passe", { exact: false }).fill(password);
    await page
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();
    await expect(page).toHaveURL(/attente/);
    await expect(
      page.getByRole("heading", { name: "Votre compte est en attente." }),
    ).toBeVisible();
    await page.goto("/app/boutiques");
    await expect(page).toHaveURL(/attente/);
    await adminPage.goto("http://localhost:3000/admin");
    await adminPage
      .getByLabel("Adresse email administrateur")
      .fill(process.env.ADMIN_EMAIL!);
    await adminPage
      .getByLabel("Mot de passe administrateur")
      .fill(process.env.ADMIN_PASSWORD!);
    await adminPage
      .getByRole("button", { name: "Se connecter à l’administration" })
      .click();
    await expect(
      adminPage.getByRole("heading", {
        name: "Les accès, sous votre contrôle.",
      }),
    ).toBeVisible();
    await adminPage.getByLabel("Rechercher par email").fill(email);
    await adminPage
      .getByRole("button", { name: "Filtrer", exact: true })
      .click();
    await adminPage
      .getByRole("button", { name: "Approuver", exact: true })
      .click();
    await expect(adminPage.getByRole("status")).toContainText(
      "Compte approuvé",
    );
    await expect(page).toHaveURL(/app\/boutiques/, { timeout: 15000 });
    await page.getByLabel("Nom de la boutique").fill("Approval test shop");
    await page.getByRole("button", { name: "Créer ma boutique" }).click();
    await expect(
      page.getByRole("heading", { name: /Bonjour, Approval test shop/ }),
    ).toBeVisible();
    await adminPage
      .getByRole("combobox", { name: /Statut/ })
      .selectOption("approved");
    await adminPage.getByLabel("Rechercher par email").fill(email);
    await adminPage
      .getByRole("button", { name: "Filtrer", exact: true })
      .click();
    await adminPage
      .getByRole("button", { name: "Retirer l’accès", exact: true })
      .click();
    await page.goto("/app/catalogue");
    await expect(page).toHaveURL(/attente/);
    await expect(
      page.getByRole("heading", { name: "Accès non autorisé" }),
    ).toBeVisible();
    await adminPage
      .getByRole("button", { name: "Se déconnecter", exact: true })
      .click();
    await expect(
      adminPage.getByRole("heading", { name: "Accès administrateur" }),
    ).toBeVisible();
  } finally {
    try {
      await adminContext.close();
    } catch {
      /* Browser may already be closed after a test timeout; always clean up DB fixtures. */
    }
    const { data: members } = await service
      .from("memberships")
      .select("organization_id")
      .eq("user_id", userId);
    for (const member of members || [])
      expect(
        (
          await service
            .from("organizations")
            .delete()
            .eq("id", member.organization_id)
        ).error,
      ).toBeNull();
    expect((await service.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});
