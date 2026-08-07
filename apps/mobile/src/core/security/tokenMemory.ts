let accessToken: string | null = null;
let accessTokenExpiresAtMs = 0;

export const tokenMemory = {
  set(token: string, expiresInSeconds: number): void {
    accessToken = token;
    accessTokenExpiresAtMs = Date.now() + Math.max(0, expiresInSeconds - 30) * 1000;
  },
  get(): string | null {
    return accessToken;
  },
  isFresh(): boolean {
    return Boolean(accessToken) && Date.now() < accessTokenExpiresAtMs;
  },
  clear(): void {
    accessToken = null;
    accessTokenExpiresAtMs = 0;
  },
};
