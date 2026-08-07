import {publicApiClient} from '../../../core/http/transport';
import {
  refreshTokenStore,
  type StoredRefreshSession,
} from '../../../core/security/refreshTokenStore';
import {tokenMemory} from '../../../core/security/tokenMemory';
import type {AuthTokenResponse} from '../domain/types';

let refreshPromise: Promise<AuthTokenResponse | null> | null = null;

function isRefreshSessionUsable(session: StoredRefreshSession): boolean {
  const expiresAtMs = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

async function clearCredentials(): Promise<void> {
  tokenMemory.clear();
  await refreshTokenStore.clear();
}

async function clearCredentialsBestEffort(): Promise<void> {
  tokenMemory.clear();
  try {
    await refreshTokenStore.clear();
  } catch {
    // Access is already fail-closed in memory. Preserve the original operation error.
  }
}

async function rotateRefreshToken(): Promise<AuthTokenResponse | null> {
  const refreshSession = await refreshTokenStore.load();
  if (!refreshSession) {
    tokenMemory.clear();
    return null;
  }

  if (!isRefreshSessionUsable(refreshSession)) {
    await clearCredentials();
    return null;
  }

  try {
    const response = await publicApiClient.post<AuthTokenResponse>(
      '/api/v1/auth/refresh',
      {refreshToken: refreshSession.refreshToken},
      {timeout: 10000},
    );

    await refreshTokenStore.save(
      response.data.refreshToken,
      response.data.refreshTokenExpiresAt,
    );
    tokenMemory.set(response.data.accessToken, response.data.expiresIn);
    return response.data;
  } catch (error) {
    await clearCredentialsBestEffort();
    throw error;
  }
}

export const sessionManager = {
  async acceptTokenPair(tokens: AuthTokenResponse): Promise<void> {
    tokenMemory.clear();
    try {
      await refreshTokenStore.save(tokens.refreshToken, tokens.refreshTokenExpiresAt);
      tokenMemory.set(tokens.accessToken, tokens.expiresIn);
    } catch (error) {
      await clearCredentialsBestEffort();
      throw error;
    }
  },
  async restore(): Promise<AuthTokenResponse | null> {
    return this.refresh();
  },
  async refresh(): Promise<AuthTokenResponse | null> {
    if (!refreshPromise) {
      refreshPromise = rotateRefreshToken().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  },
  async clearLocal(): Promise<void> {
    await clearCredentials();
  },
};
