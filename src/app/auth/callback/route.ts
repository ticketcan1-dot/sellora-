import { authDestination } from "@/domains/auth/destinations";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase/server";
import { appUrl } from "@/lib/config";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const client = await db();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          authDestination(request.nextUrl.searchParams.get("next")),
          appUrl(),
        ),
      );
  }
  return NextResponse.redirect(
    new URL("/connexion?message=Lien%20invalide%20ou%20expiré.", appUrl()),
  );
}
