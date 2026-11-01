"use server";
import { authDestination } from "./destinations";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { appUrl, configured } from "@/lib/config";
function go(path: string, message: string): never {
  redirect(`${path}?message=${encodeURIComponent(message)}`);
}
export async function authenticate(form: FormData) {
  const mode = String(form.get("mode"));
  const destination = authDestination(form.get("next"));
  const path =
    mode === "signup"
      ? "/inscription"
      : mode === "reset"
        ? "/mot-de-passe"
        : "/connexion";
  if (!configured())
    go(
      path,
      "Supabase non configuré. Consultez le README pour activer l’authentification.",
    );
  const email = z.email().safeParse(form.get("email"));
  if (!email.success) go(path, "Saisissez une adresse email valide.");
  const client = await db();
  if (mode === "reset") {
    await client.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${appUrl()}/auth/callback?next=/recuperation`,
    });
    go(path, "Si ce compte existe, un lien de récupération sera envoyé.");
  }
  const password = z
    .string()
    .min(mode === "signup" ? 12 : 1)
    .max(128)
    .safeParse(form.get("password"));
  if (!password.success)
    go(path, "Le mot de passe doit comporter entre 12 et 128 caractères.");
  if (mode === "signup") {
    const { error } = await client.auth.signUp({
      email: email.data,
      password: password.data,
      options: {
        emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });
    if (error)
      go(path, "Inscription impossible. Réessayez ou contactez l’assistance.");
    redirect("/attente?inscription=1&next=" + encodeURIComponent(destination));
  }
  const { error } = await client.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  });
  if (error)
    go(path, "Identifiants incorrects ou adresse email non confirmée.");
  const { data: profile } = await client
    .from("profiles")
    .select("approval_status")
    .single();
  if (profile && profile.approval_status !== "approved")
    redirect("/attente?next=" + encodeURIComponent(destination));
  redirect(destination);
}
export async function signOut() {
  const client = await db();
  await client.auth.signOut();
  const jar = await cookies();
  jar.delete("sellora_org");
  jar.delete({ name: "sellora_invitation_link", path: "/app/equipe" });
  jar.delete({ name: "sellora_checkout_link", path: "/app/commandes" });
  redirect("/connexion");
}
export async function updatePassword(form: FormData) {
  const password = z.string().min(12).max(128).safeParse(form.get("password"));
  if (!password.success)
    go("/recuperation", "Utilisez au moins 12 caractères.");
  const client = await db();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) go("/mot-de-passe", "Demandez un nouveau lien de récupération.");
  const { error } = await client.auth.updateUser({ password: password.data });
  if (error)
    go("/recuperation", "Mise à jour impossible. Demandez un nouveau lien.");
  go("/app", "Mot de passe mis à jour.");
}
