// Browser-safe: no next/server here.
export const FEATURE_NOT_AVAILABLE = "FEATURE_NOT_AVAILABLE";

/** The BFF's answer when the backend route isn't live yet: show "Coming soon" instead of an error. */
export function isFeatureUnavailable(status: number, body: unknown): boolean {
  return status === 404 && !!body && typeof body === "object" && (body as { code?: unknown }).code === FEATURE_NOT_AVAILABLE;
}

/** BFF side: maps an upstream failure to {status, code}. A 404/405 without a Craves error code means the gateway has no such route yet. */
export function upstreamFailure(status: number, body: unknown, fallback: string): { status: number; code: string } {
  const raw = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
  const code = typeof raw === "string" && /^[A-Z0-9_]{3,80}$/.test(raw) ? raw : null;
  if ((status === 404 || status === 405) && !code) return { status: 404, code: FEATURE_NOT_AVAILABLE };
  if (status === 401) return { status, code: "SESSION_EXPIRED" };
  return { status: [400, 403, 404, 409, 422, 429].includes(status) ? status : 503, code: code ?? fallback };
}
