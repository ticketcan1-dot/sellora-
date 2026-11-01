import sharp from "sharp";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
test("parcours réel boutique → catalogue → photo → réglages → dashboard", async ({
  page,
}) => {
  test.skip(
    process.env.SELLORA_E2E_LIVE !== "true",
    "Requires an isolated Supabase project and explicit live-test opt-in",
  );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const email = `sellora-e2e-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomUUID() + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const id = data.user!.id;
  try {
    await page.goto("/connexion");
    await page.getByLabel("Adresse email").fill(email);
    await page.getByLabel("Mot de passe", { exact: false }).fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/app\/boutiques/);
    await page.getByLabel("Nom de la boutique").fill("Boutique test isolée");
    await page.getByRole("button", { name: "Créer ma boutique" }).click();
    await expect(
      page.getByRole("heading", { name: /Bonjour, Boutique test isolée/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Catalogue", exact: true }).click();
    await page
      .getByRole("button", { name: "Ajouter un produit", exact: true })
      .click();
    await page.getByLabel("Nom du produit").fill("Bague test");
    await page.getByLabel("SKU unique").fill("TEST-ONLY");
    await page.getByLabel("Prix MAD", { exact: true }).fill("125.00");
    await page.getByLabel("Stock", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Enregistrer le produit" }).click();
    await expect(
      page.getByRole("heading", { name: "Bague test", exact: true }),
    ).toBeVisible();
    await page.getByText("Photos (0)", { exact: true }).click();
    await page.locator('input[name="image"]').setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: await sharp({
        create: { width: 16, height: 16, channels: 3, background: "#4058d5" },
      })
        .png()
        .toBuffer(),
    });
    await page.getByRole("button", { name: "Ajouter une photo" }).click();
    await expect(page.getByRole("status")).toContainText("Photo enregistrée");
    await page.getByRole("link", { name: "Assistant IA", exact: true }).click();
    await page.getByLabel("Nom de l’assistant").fill("Lina test");
    await page
      .getByRole("button", { name: "Sauvegarder la personnalisation" })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Personnalisation enregistrée" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Vue d’ensemble", exact: true })
      .click();
    await expect(
      page
        .getByText("Produits actifs", { exact: true })
        .locator("..")
        .locator(".."),
    ).toContainText("1");
    await expect(
      page
        .getByText("Conversations réelles", { exact: true })
        .locator("..")
        .locator(".."),
    ).toContainText("0");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/dashboard-${test.info().project.name}.png`,
      fullPage: true,
    });
  } finally {
    const { data: members } = await admin
      .from("memberships")
      .select("organization_id")
      .eq("user_id", id);
    for (const m of members || []) {
      const { data: images } = await admin
        .from("product_images")
        .select("path")
        .eq("organization_id", m.organization_id);
      if (images?.length)
        await admin.storage.from("catalog").remove(images.map((i) => i.path));
      const removed = await admin
        .from("organizations")
        .delete()
        .eq("id", m.organization_id);
      expect(removed.error).toBeNull();
    }
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
