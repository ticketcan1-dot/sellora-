import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyMetaSignature,
  encryptToken,
  decryptToken,
} from "@/domains/integrations/security";
import { retryDelayMs } from "@/domains/integrations/contracts";
import { trialActive } from "@/domains/billing/contracts";
import { normalizeImage } from "@/domains/catalog/images";
import sharp from "sharp";
describe("sécurité", () => {
  it("vérifie la signature sur les octets bruts et rejette une altération", () => {
    const body = Buffer.from('{"id":"event"}');
    const sig =
      "sha256=" +
      createHmac("sha256", "secret-test").update(body).digest("hex");
    expect(verifyMetaSignature(body, sig, "secret-test")).toBe(true);
    expect(verifyMetaSignature(Buffer.from("{}"), sig, "secret-test")).toBe(
      false,
    );
    expect(verifyMetaSignature(body, "sha256=ff", "secret-test")).toBe(false);
    expect(verifyMetaSignature(body, sig, "")).toBe(false);
  });
  it("chiffre avec nonce unique et détecte une modification", () => {
    process.env.CHANNEL_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const a = encryptToken("secret-test");
    const b = encryptToken("secret-test");
    expect(a).not.toBe(b);
    expect(a).not.toContain("secret-test");
    expect(decryptToken(a)).toBe("secret-test");
    const parts = a.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."))).toThrow();
  });
  it("ferme l’essai exactement à son échéance", () => {
    const sub = {
      aiDailyLimit: 50,
      trialEndsAt: new Date("2026-11-08T00:00:00Z"),
      status: "trial" as const,
    };
    expect(trialActive(sub, new Date("2026-11-07T23:59:59Z"))).toBe(true);
    expect(trialActive(sub, sub.trialEndsAt)).toBe(false);
    expect(trialActive({ ...sub, status: "expired" })).toBe(false);
  });
  it("borne le backoff", () => {
    expect(retryDelayMs(0)).toBe(1000);
    expect(retryDelayMs(4)).toBe(16000);
    expect(retryDelayMs(100)).toBe(3600000);
  });
  it("rejette un fichier déguisé en image", async () =>
    await expect(
      normalizeImage(
        new File(["not a png"], "test.png", { type: "image/png" }),
      ),
    ).rejects.toThrow());
  it("rejette SVG et fichiers trop grands", async () => {
    await expect(
      normalizeImage(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" })),
    ).rejects.toThrow();
    await expect(
      normalizeImage(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "x.png", {
          type: "image/png",
        }),
      ),
    ).rejects.toThrow();
  });
  it("réencode les images en WebP sans EXIF", async () => {
    const source = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#4058d5" },
    })
      .png()
      .toBuffer();
    const image = await normalizeImage(
      new File([new Uint8Array(source)], "image.png", { type: "image/png" }),
    );
    const metadata = await sharp(image).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
  });
});
