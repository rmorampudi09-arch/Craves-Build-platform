import axios from 'axios';
import {getRuntimeConfig} from '../../../core/config/runtimeConfig';
import {createCorrelationId} from '../../../core/http/correlation';
import {refreshTokenStore} from '../../../core/security/refreshTokenStore';
import {tokenMemory} from '../../../core/security/tokenMemory';
import type {AuthTokenResponse} from '../domain/types';

let refreshPromise: Promise<AuthTokenResponse | null> | null = null;

function authUrl(path: string): string {
  return `${getRuntimeConfig().apiBaseUrl}/api/v1/auth${path}`;
}

async function rotateRefreshToken(): Promise<AuthTokenResponse | null> {
  const refreshToken = await refreshTokenStore.get();
  if (!refreshToken) {
    tokenMemory.clear();
    return null;
  }
  try {
    const response = await axios.post<AuthTokenResponse>(
      authUrl('/refresh'),
      {refreshToken},
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': createCorrelationId(),
        },
      },
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
