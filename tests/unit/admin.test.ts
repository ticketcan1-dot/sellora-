import { describe, it, expect } from "vitest";
import {
  credentialsMatch,
  createAdminToken,
  verifyAdminToken,
  ADMIN_SESSION_SECONDS,
} from "@/domains/admin/session-token";
const credentials = {
  email: "admin@test.invalid",
  password: "test-password-only",
  secret: "a-long-test-session-secret-of-at-least-32-characters",
};
describe("administration plateforme", () => {
  it("vérifie email et mot de passe sans dépendre du rôle de boutique", () => {
    expect(
      credentialsMatch("ADMIN@test.invalid", credentials.password, credentials),
    ).toBe(true);
    expect(credentialsMatch(credentials.email, "wrong", credentials)).toBe(
      false,
    );
    expect(
      credentialsMatch("owner@test.invalid", credentials.password, credentials),
    ).toBe(false);
  });
  it("accepte uniquement une session signée valide", () => {
    const token = createAdminToken(credentials, 100000);
    expect(verifyAdminToken(token, credentials, 101000)).toBe(true);
    expect(verifyAdminToken(token + "x", credentials, 101000)).toBe(false);
    expect(verifyAdminToken(undefined, credentials, 101000)).toBe(false);
    expect(
      verifyAdminToken("eyJzdWIiOiJhZG1pbiJ9.fake", credentials, 101000),
    ).toBe(false);
  });
  it("expire après huit heures et refuse une date future", () => {
    const token = createAdminToken(credentials, 100000);
    expect(
      verifyAdminToken(
        token,
        credentials,
        100000 + ADMIN_SESSION_SECONDS * 1000,
      ),
    ).toBe(false);
    expect(verifyAdminToken(token, credentials, 99000)).toBe(false);
  });
  it("invalide les sessions après changement de mot de passe ou secret", () => {
    const token = createAdminToken(credentials);
    expect(
      verifyAdminToken(token, {
        ...credentials,
        password: "changed-test-password",
      }),
    ).toBe(false);
    expect(
      verifyAdminToken(token, {
        ...credentials,
        secret: "another-long-test-secret-with-at-least-32-chars",
      }),
    ).toBe(false);
  });
  it("crée des sessions distinctes et ne divulgue pas le mot de passe", () => {
    const a = createAdminToken(credentials);
    const b = createAdminToken(credentials);
    expect(a).not.toBe(b);
    const payload = Buffer.from(a.split(".")[0], "base64url").toString();
    expect(payload).not.toContain(credentials.password);
    expect(payload).not.toContain(credentials.secret);
  });
});
