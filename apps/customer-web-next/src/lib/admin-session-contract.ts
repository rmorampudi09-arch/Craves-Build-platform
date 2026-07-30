export type AdminSessionView = {
  identityId: string;
  displayName: string | null;
  roles: string[];
  adminEnabled: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

export function parseAdminSession(value: unknown): AdminSessionView | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const identityId = text(body.id ?? body.identityId, 64);
  const displayName = text(body.displayName, 160);
  const roles = Array.isArray(body.roles)
    ? body.roles.filter((role): role is string => typeof role === 'string')
        .map(role => role.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  if (!identityId || !UUID.test(identityId) || roles.length === 0) return null;

  return {
    identityId,
    displayName,
    roles,
    adminEnabled: roles.includes('ADMIN')
  };
}
