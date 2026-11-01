import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !service)
  throw new Error(
    "Configure the Supabase test environment (never production) first.",
  );
if (process.env.SELLORA_ALLOW_TEST_USERS !== "true")
  throw new Error(
    "Set SELLORA_ALLOW_TEST_USERS=true for an isolated test project.",
  );
const admin = createClient(url, service, { auth: { persistSession: false } });
const created = [];
const orgs = [];
try {
  const clients = [];
  for (let i = 0; i < 2; i++) {
    const email = `sellora-test-${crypto.randomUUID()}@example.invalid`;
    const password = crypto.randomUUID() + "Aa1!";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(error);
    created.push(data.user.id);
    const client = createClient(url, key, { auth: { persistSession: false } });
    assert.ifError(
      (await client.auth.signInWithPassword({ email, password })).error,
    );
    const pending = await client
      .from("profiles")
      .select("approval_status")
      .eq("id", data.user.id)
      .single();
    assert.ifError(pending.error);
    assert.equal(pending.data.approval_status, "pending");
    assert.ok(
      (
        await client.rpc("create_organization", {
          shop_name: "Must remain blocked",
        })
      ).error,
    );
    assert.ok(
      (
        await client
          .from("profiles")
          .update({ approval_status: "approved" })
          .eq("id", data.user.id)
      ).error,
    );
    assert.ifError(
      (
        await admin.rpc("set_account_approval", {
          target: data.user.id,
          new_status: "approved",
          admin_email: "test-admin@example.invalid",
        })
      ).error,
    );
    clients.push(client);
    const shop = await client.rpc("create_organization", {
      shop_name: `Isolated test ${i}`,
    });
    assert.ifError(shop.error);
    orgs.push(shop.data);
  }
  const details = { name: "Test product", status: "active", tags: [] };
  const variants = [
    { sku: "TEST-SKU", name: "Test variant", price_minor: 12500, stock: 2 },
  ];
  const product = await clients[0].rpc("save_product", {
    org: orgs[0],
    product: null,
    details,
    variants,
  });
  assert.ifError(product.error);
  const leaked = await clients[1]
    .from("products")
    .select("*")
    .eq("id", product.data);
  assert.ifError(leaked.error);
  assert.equal(leaked.data.length, 0);
  const metrics = await clients[0].rpc("dashboard_metrics", { org: orgs[0] });
  assert.ifError(metrics.error);
  assert.equal(metrics.data.active_products, 1);
  assert.equal(metrics.data.confirmed_orders, 0);
  const path = `${orgs[0]}/${product.data}/test.png`;
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#4058d5" },
  })
    .png()
    .toBuffer();
  assert.ifError(
    (
      await clients[0].storage
        .from("catalog")
        .upload(path, png, { contentType: "image/png" })
    ).error,
  );
  const own = await clients[0].storage
    .from("catalog")
    .createSignedUrl(path, 60);
  assert.ifError(own.error);
  const other = await clients[1].storage
    .from("catalog")
    .createSignedUrl(path, 60);
  assert.ok(other.error, "Other tenant must not obtain a signed URL");
  assert.ok((await clients[0].from("channel_credentials").select("*")).error);
  await admin.storage.from("catalog").remove([path]);
  assert.ifError(
    (
      await admin.rpc("set_account_approval", {
        target: created[0],
        new_status: "rejected",
        admin_email: "test-admin@example.invalid",
      })
    ).error,
  );
  const revoked = await clients[0]
    .from("products")
    .select("id")
    .eq("id", product.data);
  assert.ifError(revoked.error);
  assert.equal(revoked.data.length, 0);
  assert.ok(
    (
      await clients[0].rpc("create_organization", {
        shop_name: "Revoked must remain blocked",
      })
    ).error,
  );
  console.log(
    "PASS: Supabase Auth, pending approval, self-approval denied, admin approval, access revocation, organization RPC, catalog, metrics, tenant isolation, Storage signed URLs, credential denial",
  );
} finally {
  // Keep test-project cleanup explicit and reject any backend errors.
  for (const org of orgs) {
    const result = await admin.from("organizations").delete().eq("id", org);
    if (result.error)
      console.error("Test organization cleanup failed:", result.error.code);
  }
  for (const id of created) {
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error)
      console.error("Test user cleanup failed:", result.error.code);
  }
}
