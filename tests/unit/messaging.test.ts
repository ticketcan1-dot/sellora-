import { describe, it, expect, vi, afterEach } from "vitest";
import { normalizeMetaPayload } from "@/domains/integrations/normalizer";
import { boundedBody, BodyTooLarge } from "@/lib/http-body";
import { downloadMetaImage } from "@/domains/integrations/media";
import { sendMetaText } from "@/domains/integrations/meta-api";
import { authDestination } from "@/domains/auth/destinations";
import { catalogFingerprint, redactContacts } from "@/domains/ai/inference";
import type { Product } from "@/domains/catalog/schema";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const now = Date.now();
const wa = (message: object) => ({
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "123" },
            contacts: [{ wa_id: "212600000000", profile: { name: "Test" } }],
            messages: [
              {
                id: "m1",
                from: "212600000000",
                timestamp: String(Math.floor(now / 1000)),
                ...message,
              },
            ],
          },
        },
      ],
    },
  ],
});
describe("webhooks officiels", () => {
  it("normalise un message WhatsApp et conserve son identifiant de compte", () => {
    const result = normalizeMetaPayload(
      "whatsapp",
      wa({ type: "text", text: { body: "salam wach kayn ?" } }),
      now,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      accountId: "123",
      sender: "212600000000",
      text: "salam wach kayn ?",
      message_id: "m1",
    });
  });
  it("prend en charge une référence image sans télécharger une URL entrante", () => {
    const result = normalizeMetaPayload(
      "whatsapp",
      wa({ type: "image", image: { id: "12345" } }),
      now,
    );
    expect(result[0].media).toEqual({ provider: "whatsapp", id: "12345" });
  });
  it("traite un contenu inconnu comme reprise humaine", () =>
    expect(
      normalizeMetaPayload(
        "whatsapp",
        wa({ type: "audio", audio: { id: "123" } }),
        now,
      )[0].kind,
    ).toBe("unsupported"));
  it("ignore les dates futures et les événements trop anciens", () => {
    expect(
      normalizeMetaPayload(
        "whatsapp",
        wa({
          timestamp: String(Math.floor(now / 1000) + 1000),
          type: "text",
          text: { body: "x" },
        }),
        now,
      ),
    ).toHaveLength(0);
    expect(
      normalizeMetaPayload(
        "whatsapp",
        wa({ timestamp: "100", type: "text", text: { body: "x" } }),
        now,
      ),
    ).toHaveLength(0);
  });
  it("ignore les échos Instagram et identifie la story officielle seulement si fournie", () => {
    const payload = {
      entry: [
        {
          id: "9",
          messaging: [
            {
              sender: { id: "3" },
              recipient: { id: "9" },
              timestamp: now,
              message: {
                mid: "x",
                text: "Bonjour",
                reply_to: { story: { id: "story-1" } },
              },
            },
            {
              sender: { id: "9" },
              timestamp: now,
              message: { mid: "echo", is_echo: true, text: "Réponse" },
            },
          ],
        },
      ],
    };
    const events = normalizeMetaPayload("instagram", payload, now);
    expect(events).toHaveLength(1);
    expect(events[0].asset_id).toBe("story-1");
  });
  it("n’invente pas un identifiant produit à partir d’une URL partagée", () => {
    const payload = {
      entry: [
        {
          id: "9",
          messaging: [
            {
              sender: { id: "3" },
              timestamp: now,
              message: {
                mid: "x",
                attachments: [
                  {
                    type: "share",
                    payload: { url: "https://instagram.com/p/example" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const events = normalizeMetaPayload("instagram", payload, now);
    expect(events[0].kind).toBe("unsupported");
    expect(events[0].asset_id).toBeUndefined();
  });
  it("produit des clés stables pour l’idempotence", () =>
    expect(
      normalizeMetaPayload(
        "whatsapp",
        wa({ type: "text", text: { body: "x" } }),
        now,
      )[0].externalId,
    ).toBe(
      normalizeMetaPayload(
        "whatsapp",
        wa({ type: "text", text: { body: "x" } }),
        now,
      )[0].externalId,
    ));
  it("borne le corps reçu avant de le charger entièrement", async () => {
    const request = new Request("https://example.invalid", {
      method: "POST",
      body: new Uint8Array(1025),
    });
    await expect(boundedBody(request, 1024)).rejects.toBeInstanceOf(
      BodyTooLarge,
    );
  });
  it("accepte un petit corps exact", async () =>
    expect(
      await boundedBody(
        new Request("https://example.invalid", {
          method: "POST",
          body: "test",
        }),
        4,
      ),
    ).toEqual(new TextEncoder().encode("test")));
});
describe("transport serveur", () => {
  it.each([
    "http://fbcdn.net/a",
    "https://127.0.0.1/a",
    "https://fbcdn.net.evil.invalid/a",
    "file:///etc/passwd",
    "https://user:password@fbcdn.net/a",
  ])("rejette une source image non autorisée : %s", async (url) => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(
      downloadMetaImage({ provider: "instagram", url }, "test-token"),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("revérifie le domaine après une redirection média", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.invalid/a" },
      }),
    );
    vi.stubGlobal("fetch", request);
    await expect(
      downloadMetaImage(
        { provider: "instagram", url: "https://scontent.fbcdn.net/image" },
        "test-token",
      ),
    ).rejects.toThrow("not allowed");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("utilise l’API officielle et exige un ID de message réel", async () => {
    vi.stubEnv("META_GRAPH_VERSION", "v23.0");
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ messages: [{ id: "real-provider-id" }] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", request);
    expect(
      await sendMetaText(
        "whatsapp",
        "123",
        "212600000000",
        "Bonjour",
        "test-token",
      ),
    ).toBe("real-provider-id");
    const [url, options] = request.mock.calls[0];
    expect(url.hostname).toBe("graph.facebook.com");
    expect(options.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(options.body)).toMatchObject({
      messaging_product: "whatsapp",
      to: "212600000000",
      text: { body: "Bonjour" },
    });
  });
  it("ne traite pas une réponse fournisseur vide comme un envoi réussi", async () => {
    vi.stubEnv("META_GRAPH_VERSION", "v23.0");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    await expect(
      sendMetaText("instagram", "123", "456", "Bonjour", "test-token"),
    ).rejects.toThrow();
  });
});
describe("contexte autorisé et retours Auth", () => {
  it.each([
    "https://evil.invalid",
    "//evil.invalid",
    "/admin",
    "/invitation/short",
    "/app?redirect=evil",
  ])("refuse une destination Auth arbitraire : %s", (value) =>
    expect(authDestination(value)).toBe("/app"),
  );
  it("autorise uniquement le retour vers une invitation valide", () =>
    expect(authDestination("/invitation/" + "a".repeat(43))).toBe(
      "/invitation/" + "a".repeat(43),
    ));
  it("masque les contacts textuels avant le prompt", () => {
    const result = redactContacts(
      "email: client@example.invalid\ntel: +212 600 000 000\nadresse: rue Test 4",
    );
    expect(result).not.toContain("client@example.invalid");
    expect(result).not.toContain("600");
    expect(result).not.toContain("rue Test");
  });
  it("détecte un changement de prix ou de stock après création de la suggestion", () => {
    const product = {
      id: "p",
      status: "active",
      product_variants: [{ id: "v", price_minor: 100, stock: 3 }],
    } as unknown as Product;
    expect(catalogFingerprint([product])).not.toBe(
      catalogFingerprint([
        {
          ...product,
          product_variants: [{ ...product.product_variants[0], stock: 2 }],
        },
      ]),
    );
    expect(catalogFingerprint([product])).not.toBe(
      catalogFingerprint([
        {
          ...product,
          product_variants: [
            { ...product.product_variants[0], price_minor: 101 },
          ],
        },
      ]),
    );
  });
});
