import "server-only";
export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export function aiConfigured() {
  return Boolean(
    process.env.AI_API_KEY &&
    process.env.AI_MODEL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
