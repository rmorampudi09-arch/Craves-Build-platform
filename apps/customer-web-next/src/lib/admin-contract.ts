export type AdminIdentity = {
  displayName: string | null;
  email: string | null;
  status: string;
  adminEnabled: boolean;
};

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

export function parseAdminIdentity(value: unknown): AdminIdentity | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const status = text(raw.status, 40);
  const roles = Array.isArray(raw.roles)
    ? raw.roles.filter((role): role is string => typeof role === "string").map(role => role.trim().toUpperCase()).slice(0, 10)
    : [];
  if (!status || roles.length === 0) return null;
  return {
    displayName: text(raw.displayName, 160),
    email: text(raw.email, 320),
    status,
    adminEnabled: status === "ACTIVE" && roles.includes("ADMIN")
  };
}
