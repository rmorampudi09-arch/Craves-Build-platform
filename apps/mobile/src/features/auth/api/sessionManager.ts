import {publicApiClient} from '../../../core/http/transport';
import {refreshTokenStore} from '../../../core/security/refreshTokenStore';
import {tokenMemory} from '../../../core/security/tokenMemory';
import type {AuthTokenResponse} from '../domain/types';

let refreshPromise: Promise<AuthTokenResponse | null> | null = null;

async function rotateRefreshToken(): Promise<AuthTokenResponse | null> {
  const refreshToken = await refreshTokenStore.get();
  if (!refreshToken) {
    tokenMemory.clear();
    return null;
  }
  try {
    const response = await publicApiClient.post<AuthTokenResponse>(
      '/api/v1/auth/refresh',
      {refreshToken},
      {timeout: 10000},
    );
    tokenMemory.set(response.data.accessToken, response.data.expiresIn);
    await refreshTokenStore.save(
      response.data.refreshToken,
      response.data.refreshTokenExpiresAt,
    );
    return response.data;
  } catch (error) {
    tokenMemory.clear();
    await refreshTokenStore.clear();
    throw error;
  }
}

export const sessionManager = {
  async acceptTokenPair(tokens: AuthTokenResponse): Promise<void> {
    tokenMemory.set(tokens.accessToken, tokens.expiresIn);
    await refreshTokenStore.save(tokens.refreshToken, tokens.refreshTokenExpiresAt);
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
    tokenMemory.clear();
    await refreshTokenStore.clear();
  },
};
