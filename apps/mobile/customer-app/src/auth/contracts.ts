export type MobileIdentity = {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  status: string;
  roles: string[];
};

export type MobileSession = {
  accessToken: string;
  expiresAt: string;
  identity: MobileIdentity;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

export function parseMobileSession(value: unknown, now = Date.now()): MobileSession | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const accessToken = text(body.accessToken, 20_000);
  const expiresIn = typeof body.expiresIn === 'number' && Number.isFinite(body.expiresIn) ? Math.floor(body.expiresIn) : 0;
  const rawIdentity = body.identity;
  if (!accessToken || expiresIn < 60 || !rawIdentity || typeof rawIdentity !== 'object') return null;
  const identity = rawIdentity as Record<string, unknown>;
  const id = text(identity.id, 64);
  const phoneNumber = text(identity.phoneNumber, 24);
  const status = text(identity.status, 40);
  const roles = Array.isArray(identity.roles) ? identity.roles.filter((role): role is string => typeof role === 'string').map(role => role.trim()).filter(Boolean).slice(0, 10) : [];
  if (!id || !UUID.test(id) || !phoneNumber || !status || roles.length === 0) return null;
  return {
    accessToken,
    expiresAt: new Date(now + Math.min(expiresIn, 3600) * 1000).toISOString(),
    identity: {
      id,
      phoneNumber,
      displayName: text(identity.displayName, 160),
      status,
      roles
    }
  };
}

export function sessionIsUsable(session: MobileSession, now = Date.now()): boolean {
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - now > 30_000 && session.identity.status === 'ACTIVE';
}
