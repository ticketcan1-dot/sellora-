"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { session, tenant, uuid } from "./access";
export async function createShop(form: FormData) {
  const name = z.string().trim().min(2).max(100).safeParse(form.get("name"));
  if (!name.success)
    redirect(
      "/app/boutiques?message=Le%20nom%20doit%20comporter%202%20à%20100%20caractères.",
    );
  const { client } = await session();
  const { data, error } = await client.rpc("create_organization", {
    shop_name: name.data,
  });
  if (error)
    redirect(
      "/app/boutiques?message=Création%20impossible.%20Vérifiez%20les%20migrations.",
    );
  (await cookies()).set("sellora_org", data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/app");
}
export async function selectShop(form: FormData) {
  const id = uuid.parse(form.get("id"));
  const { client, user } = await session();
  const { data } = await client
    .from("memberships")
    .select("id")
    .eq("organization_id", id)
    .eq("user_id", user.id)
    .single();
  if (!data) throw new Error("Boutique inaccessible");
  (await cookies()).set("sellora_org", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/app");
}
export async function onboarding(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const step = z.coerce.number().int().min(1).max(4).parse(form.get("step"));
  const { error } = await client
    .from("organizations")
    .update({
      onboarding_step: step,
      onboarding_completed: form.get("complete") === "true",
    })
    .eq("id", organization.id);
  if (error) throw new Error("Progression non sauvegardée");
  redirect("/app");
}
