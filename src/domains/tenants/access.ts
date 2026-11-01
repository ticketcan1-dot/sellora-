import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { configured } from "@/lib/config";
import { z } from "zod";
export type Role = "owner" | "admin" | "agent" | "viewer";
export async function session() {
  if (!configured())
    redirect(
      "/connexion?message=Configurez%20Supabase%20pour%20ouvrir%20votre%20espace.",
    );
  const client = await db();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect("/connexion");
  return { client, user };
}
export async function tenant(
  roles: Role[] = ["owner", "admin", "agent", "viewer"],
) {
  const { client, user } = await session();
  const { data: memberships, error } = await client
    .from("memberships")
    .select(
      "organization_id,role,organizations(id,name,onboarding_step,onboarding_completed,low_stock_threshold)",
    )
    .eq("user_id", user.id)
    .order("created_at");
  if (error)
    throw new Error(
      "Impossible de charger vos boutiques. Vérifiez les migrations.",
    );
  if (!memberships?.length) redirect("/app/boutiques");
  const selected = (await cookies()).get("sellora_org")?.value;
  const membership =
    memberships.find((m) => m.organization_id === selected) || memberships[0];
  if (!roles.includes(membership.role as Role))
    throw new Error("Votre rôle ne permet pas cette action.");
  // Supabase infers an array without generated DB types; normalize the relationship explicitly.
  const raw = membership.organizations;
  const organization = (Array.isArray(raw) ? raw[0] : raw) as unknown as {
    id: string;
    name: string;
    onboarding_step: number;
    onboarding_completed: boolean;
    low_stock_threshold: number;
  };
  if (!organization) throw new Error("Boutique indisponible.");
  return {
    client,
    user,
    organization,
    role: membership.role as Role,
    memberships,
  };
}
export const uuid = z.string().uuid();
