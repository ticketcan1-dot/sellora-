"use server";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { tenant, authenticatedSession } from "./access";
import { appUrl } from "@/lib/config";
import { finish, dbMessage } from "@/lib/forms";
export async function inviteMember(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const email = z.email().max(254).parse(form.get("email"));
  const role = z.enum(["admin", "agent", "viewer"]).parse(form.get("role"));
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const { error } = await client.rpc("create_invitation", {
    _org: organization.id,
    _email: email,
    _role: role,
    _hash: hash,
  });
  if (error) finish("/app/equipe", dbMessage(error.message));
  // One-time link is kept in a short-lived HttpOnly cookie, never query-stringed to the creator page.
  (await cookies()).set(
    "sellora_invitation_link",
    appUrl() + "/invitation/" + token,
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/app/equipe",
      maxAge: 300,
    },
  );
  finish(
    "/app/equipe",
    "Invitation créée pour sept jours. Partagez le lien uniquement avec la personne invitée.",
  );
}
export async function revokeInvitation(form: FormData) {
  const { client, organization } = await tenant(["owner", "admin"]);
  const { error } = await client.rpc("revoke_invitation", {
    _org: organization.id,
    _id: z.uuid().parse(form.get("id")),
  });
  finish(
    "/app/equipe",
    error ? dbMessage(error.message) : "Invitation révoquée.",
  );
}
export async function manageMember(form: FormData) {
  const { client, organization } = await tenant(["owner"]);
  const role = z
    .enum(["admin", "agent", "viewer", "remove"])
    .parse(form.get("role"));
  const { error } = await client.rpc("manage_member", {
    _org: organization.id,
    _user: z.uuid().parse(form.get("user_id")),
    _role: role === "remove" ? null : role,
  });
  finish(
    "/app/equipe",
    error ? dbMessage(error.message) : "Membre mis à jour.",
  );
}
export async function transferOwnership(form: FormData) {
  const { client, organization } = await tenant(["owner"]);
  if (form.get("confirmation") !== organization.name)
    finish(
      "/app/equipe",
      "Recopiez le nom exact de la boutique pour confirmer le transfert.",
    );
  const { error } = await client.rpc("transfer_ownership", {
    _org: organization.id,
    _user: z.uuid().parse(form.get("user_id")),
  });
  finish(
    "/app/equipe",
    error
      ? dbMessage(error.message)
      : "Propriété transférée. Votre rôle est maintenant administrateur.",
  );
}
export async function acceptInvitation(form: FormData) {
  const { client } = await authenticatedSession();
  const token = z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .parse(form.get("token"));
  const { data: profile } = await client
    .from("profiles")
    .select("approval_status")
    .single();
  if (profile?.approval_status !== "approved")
    finish(
      "/attente?next=" + encodeURIComponent("/invitation/" + token),
      "Votre compte doit être approuvé avant de rejoindre l’équipe.",
    );
  const { data, error } = await client.rpc("accept_invitation", {
    _hash: createHash("sha256").update(token).digest("hex"),
  });
  if (error)
    finish(
      "/invitation/" + token,
      "Invitation expirée, déjà utilisée, révoquée ou destinée à une autre adresse. Votre email doit être confirmé.",
    );
  (await cookies()).set("sellora_org", data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  finish("/app", "Invitation acceptée. Bienvenue dans votre boutique.");
}
