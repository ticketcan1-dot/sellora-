import { test, expect } from "@playwright/test";
test("accueil, tarifs transparents et responsive", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Votre boutique avance/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Aucun paiement en ligne activé", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/tarifs");
  await expect(page.getByText("Prix à définir")).toHaveCount(3);
});
test("authentification accessible et échec explicite", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByLabel("Adresse email").fill("test@example.invalid");
  await page
    .getByLabel("Mot de passe", { exact: false })
    .fill("password-test-only");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("status")).toContainText(
    process.env.NEXT_PUBLIC_SUPABASE_URL
      ? "Identifiants incorrects"
      : "Supabase non configuré",
  );
  await expect(page.getByLabel("Adresse email")).toBeVisible();
});
test("routes privées protégées", async ({ page }) => {
  await page.goto("/app/catalogue");
  await expect(page).toHaveURL(/connexion/);
  await expect(
    page.getByRole("heading", { name: "Heureux de vous retrouver." }),
  ).toBeVisible();
});
test("documents juridiques identifiés comme provisoires", async ({ page }) => {
  await page.goto("/confidentialite");
  await expect(
    page.getByText("Document provisoire", { exact: false }),
  ).toBeVisible();
  await page.goto("/conditions");
  await expect(
    page.getByText("Version pilote, à compléter juridiquement.", {
      exact: false,
    }),
  ).toBeVisible();
});
test("URL admin protégée et formulaire distinct des comptes commerçants", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Accès administrateur" }),
  ).toBeVisible();
  await expect(page.getByLabel("Adresse email administrateur")).toBeVisible();
  await expect(page.getByLabel("Mot de passe administrateur")).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByRole("button", { name: "Approuver", exact: true }),
  ).toHaveCount(0);
});
