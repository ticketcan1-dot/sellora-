"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { serviceDb } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "./access";
import {
  adminCredentials,
  credentialsMatch,
  createAdminToken,
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
} from "./session-token";
function failure(message: string): never {
  redirect("/admin?message=" + encodeURIComponent(message));
}
export async function adminLogin(form: FormData) {
  const credentials = adminCredentials();
  if (!credentials)
    failure(
      "Administration non configurée : ajoutez les variables administrateur sur le serveur.",
    );
  const parsed = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) failure("Identifiants incorrects.");
  const h = await headers();
  const ip =
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  const ipHash = createHmac("sha256", credentials.secret)
    .update(ip)
    .digest("hex");
  const { data, error } = await serviceDb().rpc("reserve_admin_login", {
    attempt_ip_hash: ipHash,
  });
  if (error)
    failure(
      "Administration indisponible. Vérifiez la configuration serveur et la migration 003.",
    );
  if (!data) failure("Trop de tentatives. Réessayez dans 15 minutes.");
  if (!credentialsMatch(parsed.data.email, parsed.data.password, credentials))
    failure("Identifiants incorrects.");
  (await cookies()).set(ADMIN_COOKIE, createAdminToken(credentials), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: ADMIN_SESSION_SECONDS,
  });
  redirect("/admin");
}
export async function adminLogout() {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect("/admin");
}
export async function reviewAccount(form: FormData) {
  const admin = await requirePlatformAdmin();
  const target = z.uuid().parse(form.get("user_id"));
  const status = z
    .enum(["approved", "rejected", "pending"])
    .parse(form.get("status"));
  const { error } = await serviceDb().rpc("set_account_approval", {
    target,
    new_status: status,
    admin_email: admin.email,
  });
  if (error) failure("La décision n’a pas été enregistrée. Réessayez.");
  revalidatePath("/admin");
  redirect(
    "/admin?message=" +
      encodeURIComponent(
        status === "approved"
          ? "Compte approuvé. Son accès est maintenant autorisé."
          : status === "rejected"
            ? "Accès au compte refusé ou retiré."
            : "Compte remis en attente.",
      ),
  );
}
