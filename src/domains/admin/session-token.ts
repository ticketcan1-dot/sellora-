import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { z } from "zod";
export const ADMIN_COOKIE = "sellora_platform_admin";
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
export type AdminCredentials = {
  email: string;
  password: string;
  secret: string;
};
export function adminCredentials(): AdminCredentials | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!email || !password || !secret || secret.length < 32) return null;
  return { email, password, secret };
}
function hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}
function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function credentialsMatch(
  email: string,
  password: string,
  credentials: AdminCredentials,
) {
  const emailMatch = equal(
    hmac(email.trim().toLowerCase(), credentials.secret),
    hmac(credentials.email, credentials.secret),
  );
  const passwordMatch = equal(
    hmac(password, credentials.secret),
    hmac(credentials.password, credentials.secret),
  );
  return emailMatch && passwordMatch;
}
function version(c: AdminCredentials) {
  return hmac(c.email + "\0" + c.password, c.secret);
}
export function createAdminToken(c: AdminCredentials, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: c.email,
      exp: Math.floor(now / 1000) + ADMIN_SESSION_SECONDS,
      iat: Math.floor(now / 1000),
      v: version(c),
      nonce: randomBytes(16).toString("base64url"),
    }),
  ).toString("base64url");
  return payload + "." + hmac(payload, c.secret);
}
export function verifyAdminToken(
  token: string | undefined,
  c: AdminCredentials,
  now = Date.now(),
) {
  if (!token || token.length > 2048) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !equal(parts[1], hmac(parts[0], c.secret)))
    return false;
  try {
    const payload = z
      .object({
        sub: z.string(),
        exp: z.number().int(),
        iat: z.number().int(),
        v: z.string(),
      })
      .parse(JSON.parse(Buffer.from(parts[0], "base64url").toString()));
    return (
      payload.sub === c.email &&
      equal(payload.v, version(c)) &&
      payload.iat <= Math.floor(now / 1000) &&
      payload.exp > Math.floor(now / 1000) &&
      payload.exp - payload.iat === ADMIN_SESSION_SECONDS
    );
  } catch {
    return false;
  }
}
