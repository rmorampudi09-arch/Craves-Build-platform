export type RefreshFailure = { status: number; code: string; terminal: boolean; retryAfter?: string };

export function refreshFailure(status: number, retryAfter: string | null = null): RefreshFailure {
  if (status === 401 || status === 403) return { status, code: status === 403 ? "ADMIN_ACCESS_REVOKED" : "SESSION_EXPIRED", terminal: true };
  if (status === 429) return { status: 429, code: "REFRESH_THROTTLED", terminal: false,
    retryAfter: retryAfter && /^\d{1,5}$/.test(retryAfter) ? String(Math.min(300, Number(retryAfter))) : "30" };
  return { status: 503, code: "REFRESH_UNAVAILABLE", terminal: false };
}

// Server-only timing extraction AFTER Auth Service validates the credential; never authorizes a request.
export function sessionTiming(accessToken: string): { accessExpiresAt: number; sessionExpiresAt: number | null; serverTime: number } | null {
  try {
    const claims = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) return null;
    return { accessExpiresAt: claims.exp * 1000, serverTime: Date.now(),
      sessionExpiresAt: typeof claims.admin_session_exp === "number" ? claims.admin_session_exp * 1000 : null };
  } catch { return null; }
}
