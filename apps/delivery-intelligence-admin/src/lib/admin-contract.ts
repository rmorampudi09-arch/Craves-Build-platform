export type AdminIdentity = {
  displayName: string | null;
  email: string | null;
  status: string;
  adminEnabled: boolean;
};

const ADMIN_ROLES = new Set([
  "ADMIN",
  "PLATFORM_ADMIN",
  "SUPPORT_ADMIN",
  "PAYMENTS_ADMIN",
  "OPERATIONS_ADMIN",
  "AUDIT_ADMIN",
]);

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseAdminIdentity(value: unknown): AdminIdentity | null {
  const envelope = record(value);
  if (!envelope) return null;

  const flatStatus = text(envelope.status, 40)?.toUpperCase() ?? null;
  if (flatStatus && typeof envelope.adminEnabled === "boolean") {
    return {
      displayName: text(envelope.displayName, 160),
      email: text(envelope.email, 320),
      status: flatStatus,
      adminEnabled: flatStatus === "ACTIVE" && envelope.adminEnabled,
    };
  }

  const raw = record(envelope.identity) ?? envelope;
  const status = text(raw.status, 40)?.toUpperCase() ?? null;
  const roles = Array.isArray(raw.roles)
    ? raw.roles
        .filter((role): role is string => typeof role === "string")
        .map(role => role.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  if (!status) return null;
  const adminEnabled = status === "ACTIVE" && roles.some(role => ADMIN_ROLES.has(role));
  return {
    displayName: text(raw.displayName, 160),
    email: text(raw.email, 320),
    status,
    adminEnabled,
  };
}
