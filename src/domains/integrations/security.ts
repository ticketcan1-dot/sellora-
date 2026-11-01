import "server-only";
import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
export function verifyMetaSignature(
  raw: Uint8Array,
  signature: string,
  secret: string,
) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
function key() {
  const value = Buffer.from(process.env.CHANNEL_ENCRYPTION_KEY || "", "base64");
  if (value.length !== 32)
    throw new Error("Clé de chiffrement 32 octets requise");
  return value;
}
export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const bytes = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decryptToken(ciphertext: string) {
  const [iv, tag, data] = ciphertext
    .split(".")
    .map((x) => Buffer.from(x, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
