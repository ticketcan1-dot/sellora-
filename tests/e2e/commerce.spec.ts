import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
test("vente réelle par lien privé, encaissement, messagerie simulée et invitation d’équipe", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  test.skip(
    process.env.SELLORA_E2E_LIVE !== "true",
    "Requires an isolated Supabase test project with all migrations",
  );
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const suffix = crypto.randomUUID();
  const email = `sellora-commerce-${suffix}@example.invalid`;
  const password = crypto.randomUUID() + "Aa1!";
  const shopName = "Commerce E2E " + suffix.slice(0, 6);
  const userIds: string[] = [];
  let org: string | undefined;
  const buyerContext = await browser.newContext();
  const buyer = await buyerContext.newPage();
  try {
    const { data: user, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    userIds.push(user.user!.id);
    expect(
      (
        await service.rpc("set_account_approval", {
          target: user.user!.id,
          new_status: "approved",
          admin_email: "test-admin@example.invalid",
        })
      ).error,
    ).toBeNull();
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    expect(
      (await client.auth.signInWithPassword({ email, password })).error,
    ).toBeNull();
    const shop = await client.rpc("create_organization", {
      shop_name: shopName,
    });
    expect(shop.error).toBeNull();
    org = shop.data;
    const product = await client.rpc("save_product", {
      org,
      product: null,
      details: { name: "Produit Commerce E2E", status: "active", tags: [] },
      variants: [
        { sku: "COMMERCE-E2E", name: "Standard", price_minor: 12500, stock: 3 },
      ],
    });
    expect(product.error).toBeNull();
    await page.goto("/connexion");
    await page.getByLabel("Adresse email", { exact: true }).fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: new RegExp("Bonjour, " + shopName) }),
    ).toBeVisible();
    await page.goto("/app/commandes");
    await page.getByText("Créer une commande", { exact: true }).click();
    await page.getByLabel("Type de préparation").selectOption("link");
    await page.getByLabel(/Frais de livraison/).fill("25.00");
    await page.getByRole("button", { name: "Créer le lien privé" }).click();
    const link = await page
      .getByLabel("Copier et partager uniquement avec le client")
      .inputValue();
    expect(link).toContain("/commande/");
    await buyer.goto(link);
    await expect(
      buyer.getByRole("heading", { name: "Votre récapitulatif de commande" }),
    ).toBeVisible();
    await buyer
      .getByLabel("Nom complet", { exact: true })
      .fill("Client Test Uniquement");
    await buyer.getByLabel("Téléphone", { exact: true }).fill("0600000000");
    await buyer.getByLabel("Ville", { exact: true }).fill("Casablanca");
    await buyer
      .getByLabel("Adresse de livraison", { exact: true })
      .fill("Adresse de test uniquement");
    await buyer
      .getByRole("checkbox", { name: /J’accepte l’utilisation/ })
      .check();
    await buyer
      .getByRole("checkbox", { name: /Je confirme les produits/ })
      .check();
    await buyer
      .getByRole("button", { name: "Confirmer ma commande", exact: true })
      .click();
    await expect(
      buyer.getByRole("heading", { name: "Votre commande est enregistrée." }),
    ).toBeVisible();
    const { data: order, error: oe } = await service
      .from("orders")
      .select("id,status,total_minor,paid_at")
      .eq("organization_id", org)
      .single();
    expect(oe).toBeNull();
    expect(order!.status).toBe("confirmed");
    expect(order!.total_minor).toBe(15000);
    expect(order!.paid_at).toBeNull();
    const { data: variant } = await service
      .from("product_variants")
      .select("stock")
      .eq("organization_id", org)
      .single();
    expect(variant!.stock).toBe(2);
    await page.goto("/app/commandes?id=" + order!.id);
    await page
      .getByText("Enregistrer un encaissement reçu", { exact: true })
      .click();
    await page.getByLabel(/Montant reçu/).fill("150.00");
    await page
      .getByLabel("Référence du reçu ou de la preuve")
      .fill("RECU-TEST-" + suffix);
    await page
      .getByRole("checkbox", { name: /J’atteste que cet encaissement/ })
      .check();
    await page
      .getByRole("button", { name: "Enregistrer l’encaissement", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Encaissement enregistré manuellement",
    );
    await page.goto("/app");
    await expect(
      page
        .getByText("Montant confirmé", { exact: true })
        .locator("..")
        .locator(".."),
    ).toContainText("150");
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
    await page.goto("/app/canaux");
    await page
      .getByLabel("Message client de test")
      .fill("Message de simulation uniquement");
    await page
      .getByRole("button", { name: "Créer un fil de simulation" })
      .click();
    await expect(page).toHaveURL(/app\/conversations\?id=/);
    await page
      .getByLabel("Réponse de l’équipe")
      .fill("Réponse humaine simulée uniquement");
    await page
      .getByRole("button", { name: "Répondre dans la simulation" })
      .click();
    await expect(page.getByRole("status")).toContainText("Aucun message réel");
    const { count: realThreads } = await service
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("is_simulation", false);
    expect(realThreads).toBe(0);
    const { count: outbox } = await service
      .from("message_outbox")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org);
    expect(outbox).toBe(0);
    await page
      .getByLabel("Note visible uniquement à l’équipe")
      .fill("Note interne de test");
    await page
      .getByRole("button", { name: "Ajouter une note interne" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Elle ne sera pas envoyée",
    );
    const inviteEmail = `sellora-member-${suffix}@example.invalid`;
    const invitePassword = crypto.randomUUID() + "Aa1!";
    const inviteUser = await service.auth.admin.createUser({
      email: inviteEmail,
      password: invitePassword,
      email_confirm: true,
    });
    expect(inviteUser.error).toBeNull();
    userIds.push(inviteUser.data.user!.id);
    expect(
      (
        await service.rpc("set_account_approval", {
          target: inviteUser.data.user!.id,
          new_status: "approved",
          admin_email: "test-admin@example.invalid",
        })
      ).error,
    ).toBeNull();
    await page.goto("/app/equipe");
    await page.getByLabel("Adresse email", { exact: true }).fill(inviteEmail);
    await page
      .getByRole("button", { name: "Créer l’invitation", exact: true })
      .click();
    const inviteLink = await page
      .getByLabel("Copier le lien", { exact: true })
      .inputValue();
    await buyer.goto(inviteLink);
    await buyer
      .getByRole("link", { name: "Se connecter", exact: true })
      .click();
    await buyer.getByLabel("Adresse email", { exact: true }).fill(inviteEmail);
    await buyer
      .getByLabel("Mot de passe", { exact: true })
      .fill(invitePassword);
    await buyer
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();
    await expect(buyer).toHaveURL(/invitation\//);
    await buyer.getByRole("button", { name: "Accepter l’invitation" }).click();
    await expect(
      buyer.getByRole("heading", { name: new RegExp("Bonjour, " + shopName) }),
    ).toBeVisible();
    await page.goto("/app/parametres");
    const exported = await page.request.get("/app/parametres/export");
    expect(exported.status()).toBe(200);
    const body = await exported.json();
    expect(body.organization.id).toBe(org);
    expect(body.orders).toHaveLength(1);
    expect(body.channel_credentials).toBeUndefined();
    expect(body.oauth_states).toBeUndefined();
    await page.goto("/app/facturation");
    await page
      .locator("form")
      .filter({ has: page.locator('input[name="plan"][value="business"]') })
      .getByRole("button", { name: "Demander l’activation" })
      .click();
    await expect(page.getByRole("status")).toContainText("Aucun paiement");
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Accès administrateur" }),
    ).toBeVisible();
  } finally {
    await buyerContext.close().catch(() => undefined);
    if (org) {
      const { data: images } = await service
        .from("messages")
        .select("image_path")
        .eq("organization_id", org)
        .not("image_path", "is", null);
      if (images?.length)
        await service.storage
          .from("simulation")
          .remove(images.map((i) => i.image_path));
      expect(
        (await service.from("organizations").delete().eq("id", org)).error,
      ).toBeNull();
    }
    for (const user of userIds)
      expect((await service.auth.admin.deleteUser(user)).error).toBeNull();
  }
});
