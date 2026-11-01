import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminCredentials,
  verifyAdminToken,
  ADMIN_COOKIE,
} from "./session-token";
export async function platformAdmin() {
  const credentials = adminCredentials();
  if (
    !credentials ||
    !verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value, credentials)
  )
    return null;
  return { email: credentials.email };
}
export async function requirePlatformAdmin() {
  const admin = await platformAdmin();
  if (!admin) redirect("/admin");
  return admin;
}
