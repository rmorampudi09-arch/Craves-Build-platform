const ACCESS_TOKEN_REFRESH_SAFETY_WINDOW_SECONDS = 30;

let accessToken: string | null = null;
let accessTokenRefreshAtMs = 0;

function normalizedLifetimeSeconds(expiresInSeconds: number): number {
  return Number.isFinite(expiresInSeconds) ? Math.max(0, expiresInSeconds) : 0;
}

export const tokenMemory = {
  set(token: string, expiresInSeconds: number): void {
    accessToken = token;
    const refreshInSeconds = Math.max(
      0,
      normalizedLifetimeSeconds(expiresInSeconds) -
        ACCESS_TOKEN_REFRESH_SAFETY_WINDOW_SECONDS,
    );
    accessTokenRefreshAtMs = Date.now() + refreshInSeconds * 1000;
  },
  get(): string | null {
    return accessToken;
  },
  isFresh(): boolean {
    return Boolean(accessToken) && Date.now() < accessTokenRefreshAtMs;
  },
  millisecondsUntilRefresh(): number | null {
    if (!accessToken) {
      return null;
    }
    return Math.max(0, accessTokenRefreshAtMs - Date.now());
  },
  clear(): void {
    accessToken = null;
    accessTokenRefreshAtMs = 0;
  },
};
