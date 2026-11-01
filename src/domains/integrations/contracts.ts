export type ChannelProvider = "instagram" | "whatsapp";
export type ChannelStatus =
  "non_configured" | "pending_approval" | "connected" | "error" | "revoked";
export type InboundEvent = {
  provider: ChannelProvider;
  externalId: string;
  organizationId: string;
  receivedAt: string;
  type: "message" | "status" | "unsupported";
  payload: unknown;
};
export interface OfficialChannelAdapter {
  provider: ChannelProvider;
  authorizationUrl(state: string): Promise<string>;
  verifyWebhook(rawBody: Uint8Array, signature: string): boolean;
  normalize(payload: unknown): Promise<InboundEvent[]>;
  sendApprovedMessage(input: {
    organizationId: string;
    conversationId: string;
    content: string;
    idempotencyKey: string;
  }): Promise<{ externalId: string }>;
  disconnect(organizationId: string): Promise<void>;
}
export type RetryableEvent = {
  attempts: number;
  nextAttemptAt: Date;
  status: "pending" | "processing" | "completed" | "failed";
};
export function retryDelayMs(attempt: number) {
  return Math.min(3600000, 1000 * 2 ** Math.min(Math.max(attempt, 0), 12));
}
