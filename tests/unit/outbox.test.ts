import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ service: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ serviceDb: mocks.service }));
vi.mock("@/domains/integrations/meta-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/domains/integrations/meta-api")>();
  return { ...actual, metaReady: () => true, sendMetaText: mocks.send };
});
vi.mock("@/domains/integrations/security", () => ({
  decryptToken: () => "test-token",
}));
import { processOutbound } from "@/domains/integrations/worker";
import { MetaRequestError } from "@/domains/integrations/meta-api";
const org = "60000000-0000-4000-8000-000000000001";
const sender = "60000000-0000-4000-8000-000000000002";
let rows: Record<string, unknown>;
let mutations: { table: string; value: Record<string, unknown> }[];
function builder(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    limit: () => chain,
    update: (value: Record<string, unknown>) => {
      mutations.push({ table, value });
      return chain;
    },
    single: async () => ({
      data: Array.isArray(rows[table])
        ? (rows[table] as unknown[])[0]
        : rows[table],
      error: null,
    }),
    maybeSingle: async () => ({
      data: Array.isArray(rows[table])
        ? (rows[table] as unknown[])[0]
        : rows[table],
      error: null,
    }),
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: Array.isArray(rows[table]) ? rows[table] : [rows[table]],
        error: null,
      }).then(resolve, reject),
  };
  return chain;
}
beforeEach(() => {
  vi.clearAllMocks();
  mutations = [];
  rows = {
    conversations: {
      id: org,
      channel_id: org,
      status: "open",
      last_inbound_at: new Date().toISOString(),
      external_contact_id: "123",
      ai_paused: false,
    },
    messages: { content: "Bonjour" },
    organizations: { is_active: true },
    subscriptions: {
      status: "trial",
      trial_ends_at: new Date(Date.now() + 86400000).toISOString(),
      manual_until: null,
    },
    memberships: [{ user_id: sender }],
    profiles: { approval_status: "approved" },
    channels: { id: org, provider: "whatsapp", external_account_id: "123" },
    channel_credentials: { ciphertext: "test-ciphertext", expires_at: null },
  };
  mocks.service.mockReturnValue({
    from: builder,
    rpc: async () => ({
      data: [
        {
          id: org,
          organization_id: org,
          conversation_id: org,
          message_id: org,
          suggestion_id: null,
          automatic: false,
          actor_id: sender,
          attempts: 1,
        },
      ],
      error: null,
    }),
  });
  mocks.send.mockResolvedValue("provider-message-id");
});
describe("boîte d’envoi", () => {
  it("ne marque envoyé qu’après un ID fournisseur confirmé", async () => {
    expect(await processOutbound()).toBe("sent");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mutations).toContainEqual({
      table: "messages",
      value: { delivery_status: "sent", external_id: "provider-message-id" },
    });
  });
  it("bloque un membre révoqué même si sa réponse était déjà en file", async () => {
    rows.profiles = { approval_status: "rejected" };
    expect(await processOutbound()).toBe("failed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("revérifie la fenêtre de réponse juste avant l’envoi", async () => {
    rows.conversations = {
      ...(rows.conversations as object),
      last_inbound_at: new Date(Date.now() - 25 * 3600000).toISOString(),
    };
    expect(await processOutbound()).toBe("failed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("revérifie les droits d’usage avant l’envoi", async () => {
    rows.subscriptions = { status: "expired" };
    expect(await processOutbound()).toBe("failed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("conserve un timeout comme incertain sans le renvoyer", async () => {
    mocks.send.mockRejectedValue(new Error("timeout"));
    expect(await processOutbound()).toBe("unknown");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("ne réessaie automatiquement que le refus explicite pour limite de débit", async () => {
    mocks.send.mockRejectedValue(new MetaRequestError(429, 4));
    expect(await processOutbound()).toBe("queued");
    expect(
      mutations.some(
        (m) => m.table === "message_outbox" && m.value.next_attempt_at,
      ),
    ).toBe(true);
  });
  it("ne renvoie pas aveuglément après une erreur 5xx du fournisseur", async () => {
    mocks.send.mockRejectedValue(new MetaRequestError(503, 1));
    expect(await processOutbound()).toBe("unknown");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
