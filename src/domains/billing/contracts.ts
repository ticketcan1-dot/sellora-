export interface PaymentProvider {
  createCheckout(input: {
    organizationId: string;
    plan: string;
  }): Promise<{ url: string }>;
  verifyWebhook(raw: Uint8Array, signature: string): boolean;
}
export interface Entitlements {
  aiDailyLimit: number;
  trialEndsAt: Date;
  status: "trial" | "manual" | "expired";
}
export function trialActive(entitlements: Entitlements, now = new Date()) {
  return (
    entitlements.status === "manual" ||
    (entitlements.status === "trial" && now < entitlements.trialEndsAt)
  );
}
