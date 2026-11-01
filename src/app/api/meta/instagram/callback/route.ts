import { NextRequest, NextResponse } from "next/server";
import { session } from "@/domains/tenants/access";
import {
  consumeOAuthState,
  connectInstagram,
} from "@/domains/integrations/connect";
import { appUrl } from "@/lib/config";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const { user } = await session();
  let message =
    "Connexion refusée ou incomplète. Vérifiez les autorisations et la configuration Meta.";
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    if (!code || !state) throw new Error("OAuth cancelled");
    const org = await consumeOAuthState(state, user.id, "instagram");
    await connectInstagram(
      code,
      org,
      appUrl() + "/api/meta/instagram/callback",
    );
    message =
      "Instagram connecté après vérification auprès de l’API officielle.";
  } catch {}
  return NextResponse.redirect(
    new URL("/app/canaux?message=" + encodeURIComponent(message), appUrl()),
  );
}
