import { NextResponse } from "next/server";
import { tenant } from "@/domains/tenants/access";
import { createOAuthState } from "@/domains/integrations/connect";
import { metaReady } from "@/domains/integrations/meta-api";
import { appUrl } from "@/lib/config";
export async function GET() {
  const { organization, user } = await tenant(["owner", "admin"]);
  if (!metaReady("instagram"))
    return NextResponse.redirect(
      new URL(
        "/app/canaux?message=Connexion%20Instagram%20non%20configurée.",
        appUrl(),
      ),
    );
  const state = await createOAuthState(organization.id, user.id, "instagram");
  const target = new URL("https://www.instagram.com/oauth/authorize");
  target.search = new URLSearchParams({
    enable_fb_login: "0",
    force_authentication: "1",
    client_id: process.env.INSTAGRAM_APP_ID!,
    redirect_uri: appUrl() + "/api/meta/instagram/callback",
    response_type: "code",
    scope: "instagram_business_basic,instagram_business_manage_messages",
    state,
  }).toString();
  return NextResponse.redirect(target);
}
