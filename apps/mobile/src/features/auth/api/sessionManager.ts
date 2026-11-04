import {toAppApiError} from '../../../core/http/apiError';
import {publicApiClient} from '../../../core/http/transport';
import {
  captureException,
  startPerformanceTrace,
  trackSessionEvent,
} from '../../../core/observability/observability';
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
type TokensRotatedListener = (tokens: AuthTokenResponse) => void;

let refreshPromise: Promise<AuthTokenResponse | null> | null = null;
const invalidationListeners = new Set<SessionInvalidationListener>();
const rotationListeners = new Set<TokensRotatedListener>();

function isRefreshSessionUsable(session: StoredRefreshSession): boolean {
  const expiresAtMs = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

function notifyInvalidated(reason: SessionInvalidationReason): void {
  trackSessionEvent('session_invalidated', {reason});
  invalidationListeners.forEach(listener => listener(reason));
}

function notifyRotated(tokens: AuthTokenResponse): void {
  rotationListeners.forEach(listener => {
    try {
      listener(tokens);
    } catch {
      // A broken listener must not fail a refresh that already succeeded.
    }
  });
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
  const trace = startPerformanceTrace('session_refresh');
  trackSessionEvent('session_refresh_started');
  const hadAccessToken = Boolean(tokenMemory.get());
  const refreshSession = await refreshTokenStore.load();

  if (!refreshSession) {
    tokenMemory.clear();
    if (hadAccessToken) {
      notifyInvalidated('missing_refresh_credential');
    }
    trace.end('failure', {reason: 'missing_refresh_credential'});
    return null;
  }

  if (!isRefreshSessionUsable(refreshSession)) {
    await clearCredentials();
    notifyInvalidated('expired_refresh_credential');
    trace.end('failure', {reason: 'expired_refresh_credential'});
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
      trace.end('failure', {
        reason: 'rejected_refresh_credential',
        status: normalized.status ?? null,
      });
      return null;
    }

    captureException(error, 'session_refresh_failure', {
      status: normalized.status ?? null,
      retriable: normalized.retriable,
    });
    trackSessionEvent('session_refresh_failed', {
      status: normalized.status ?? null,
      retriable: normalized.retriable,
    });
    trace.end('failure', {
      status: normalized.status ?? null,
      retriable: normalized.retriable,
    });
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
    trackSessionEvent('session_refresh_succeeded');
    trace.end('success');
    notifyRotated(tokens);
    return tokens;
  } catch (error) {
    await invalidateSession('refresh_persistence_failed');
    captureException(error, 'session_refresh_persistence_failure');
    trace.end('failure', {reason: 'refresh_persistence_failed'});
    throw error;
  }
}

export const sessionManager = {
  async acceptTokenPair(tokens: AuthTokenResponse): Promise<void> {
    tokenMemory.clear();
    try {
      await refreshTokenStore.save(tokens.refreshToken, tokens.refreshTokenExpiresAt);
      tokenMemory.set(tokens.accessToken, tokens.expiresIn);
      trackSessionEvent('session_established');
    } catch (error) {
      await clearCredentialsBestEffort();
      captureException(error, 'session_establishment_failure');
      trackSessionEvent('session_establishment_failed');
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
  onTokensRotated(listener: TokensRotatedListener): () => void {
    rotationListeners.add(listener);
    return () => {
      rotationListeners.delete(listener);
    };
  },
  async clearLocal(): Promise<void> {
    await clearCredentials();
    trackSessionEvent('session_cleared_local');
  },
};
