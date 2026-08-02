export type AdminSubscriptionStatus = "PENDING_PAYMENT" | "ACTIVE" | "PAUSED" | "PAYMENT_FAILED" | "EXPIRED" | "CANCELLED";

const STATUSES = new Set(["PENDING_PAYMENT", "ACTIVE", "PAUSED", "PAYMENT_FAILED", "EXPIRED", "CANCELLED"]);

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

export function parseAdminSubscriptionOperation(value: unknown): { status: AdminSubscriptionStatus; reason: string } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const status = text(raw.status, 40);
  const reason = text(raw.reason, 1000);
  return status && STATUSES.has(status) && reason ? { status: status as AdminSubscriptionStatus, reason } : null;
}
