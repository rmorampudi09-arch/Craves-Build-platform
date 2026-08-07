import {toAppApiError} from '../../../core/http/apiError';
import {publicApiClient} from '../../../core/http/transport';
import {
  refreshTokenStore,
  type StoredRefreshSession,
} from '../../../core/security/refreshTokenStore';
import {tokenMemory} from '../../../core/security/tokenMemory';
import type {AuthTokenResponse} from '../domain/types';

export type SessionInvalidationReason =
  | 'missing_refresh_credential'
  | 'expired_refresh_credential'
  | 'rejected_refresh_credential'
  | 'refresh_persistence_failed';

type SessionInvalidationListener = (reason: SessionInvalidationReason) => void;

let refreshPromise: Promise<AuthTokenResponse | null> | null = null;
const invalidationListeners = new Set<SessionInvalidationListener>();

function isRefreshSessionUsable(session: StoredRefreshSession): boolean {
  const expiresAtMs = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

function notifyInvalidated(reason: SessionInvalidationReason): void {
  invalidationListeners.forEach(listener => listener(reason));
}

function isTerminalRefreshFailure(error: unknown): boolean {
  const normalized = toAppApiError(error);
  if (normalized.status === 401 || normalized.status === 403) {
    return true;
  }
  return Boolean(
    normalized.status &&
      normalized.status >= 400 &&
      normalized.status < 500 &&
      !normalized.retriable,
  );
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

async function invalidateSession(
  reason: SessionInvalidationReason,
): Promise<void> {
  await clearCredentialsBestEffort();
  notifyInvalidated(reason);
}

async function rotateRefreshToken(): Promise<AuthTokenResponse | null> {
  const hadAccessToken = Boolean(tokenMemory.get());
  const refreshSession = await refreshTokenStore.load();

  if (!refreshSession) {
    tokenMemory.clear();
    if (hadAccessToken) {
      notifyInvalidated('missing_refresh_credential');
    }
    return null;
  }

  if (!isRefreshSessionUsable(refreshSession)) {
    await clearCredentials();
    notifyInvalidated('expired_refresh_credential');
    return null;
  }

  let tokens: AuthTokenResponse;
  try {
    const response = await publicApiClient.post<AuthTokenResponse>(
      '/api/v1/auth/refresh',
      {refreshToken: refreshSession.refreshToken},
      {timeout: 10000},
    );
    tokens = response.data;
  } catch (error) {
    const normalized = toAppApiError(error);
    if (isTerminalRefreshFailure(normalized)) {
      await invalidateSession('rejected_refresh_credential');
      return null;
    }

    // Keep the persisted refresh credential on transient network/service failures so
    // startup retry or a later silent refresh can recover without forcing sign-in.
    throw normalized;
  }

  try {
    await refreshTokenStore.save(
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );
    tokenMemory.set(tokens.accessToken, tokens.expiresIn);
    return tokens;
  } catch (error) {
    await invalidateSession('refresh_persistence_failed');
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
  subscribeInvalidation(listener: SessionInvalidationListener): () => void {
    invalidationListeners.add(listener);
    return () => {
      invalidationListeners.delete(listener);
    };
  },
  async clearLocal(): Promise<void> {
    await clearCredentials();
  },
};
