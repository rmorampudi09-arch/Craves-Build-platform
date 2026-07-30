export type AdminAccountAction = "SUSPEND" | "REACTIVATE";

export type AdminAccountInterventionStatus = {
  interventionId: string | null;
  identityId: string;
  maskedPhoneNumber: string | null;
  status: string;
  tokenVersion: number;
  action: string | null;
  requestedStatus: string | null;
  providerStatus: string | null;
  providerAttemptCount: number;
  providerLastError: string | null;
  requestedAt: string | null;
  providerCompletedAt: string | null;
  correlationId: string | null;
  changed: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\r\n]+/g, " ").trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

function nullableText(value: unknown, max = 500): string | null {
  return value == null ? null : text(value, max);
}

function uuid(value: unknown): string | null {
  const candidate = text(value, 64);
  return candidate && UUID.test(candidate) ? candidate : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function dateTime(value: unknown): string | null {
  const candidate = nullableText(value, 80);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : null;
}

export function parseAdminAccountLookup(value: unknown): { identityId: string } | null {
  const root = record(value);
  const identityId = uuid(root?.identityId);
  return identityId ? { identityId } : null;
}

export function parseAdminAccountAction(value: unknown): {
  identityId: string;
  action: AdminAccountAction;
  reason: string;
  confirmation: string;
} | null {
  const root = record(value);
  const identityId = uuid(root?.identityId);
  const action = text(root?.action, 20) as AdminAccountAction | null;
  const reason = text(root?.reason, 500);
  const confirmation = text(root?.confirmation, 20);
  if (!identityId || !action || !["SUSPEND", "REACTIVATE"].includes(action)) return null;
  if (!reason || reason.length < 10 || confirmation !== action) return null;
  return { identityId, action, reason, confirmation };
}

export function parseAdminAccountInterventionStatus(value: unknown): AdminAccountInterventionStatus | null {
  const root = record(value);
  if (!root) return null;
  const identityId = uuid(root.identityId);
  const status = text(root.status, 80);
  const tokenVersion = nonNegativeInteger(root.tokenVersion);
  const providerAttemptCount = nonNegativeInteger(root.providerAttemptCount);
  if (!identityId || !status || tokenVersion == null || providerAttemptCount == null || typeof root.changed !== "boolean") {
    return null;
  }
  return {
    interventionId: root.interventionId == null ? null : uuid(root.interventionId),
    identityId,
    maskedPhoneNumber: nullableText(root.maskedPhoneNumber, 40),
    status,
    tokenVersion,
    action: nullableText(root.action, 40),
    requestedStatus: nullableText(root.requestedStatus, 80),
    providerStatus: nullableText(root.providerStatus, 80),
    providerAttemptCount,
    providerLastError: nullableText(root.providerLastError, 500),
    requestedAt: dateTime(root.requestedAt),
    providerCompletedAt: dateTime(root.providerCompletedAt),
    correlationId: root.correlationId == null ? null : uuid(root.correlationId),
    changed: root.changed
  };
}
