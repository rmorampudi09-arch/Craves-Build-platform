import {AppApiError} from '../../../core/http/apiError';
import {publicApiClient} from '../../../core/http/transport';
import {refreshTokenStore} from '../../../core/security/refreshTokenStore';
import {tokenMemory} from '../../../core/security/tokenMemory';
import type {AuthTokenResponse} from '../domain/types';
import {sessionManager} from './sessionManager';

jest.mock('../../../core/http/transport', () => ({
  publicApiClient: {
    post: jest.fn(),
  },
}));

jest.mock('../../../core/security/refreshTokenStore', () => ({
  refreshTokenStore: {
    save: jest.fn(),
    load: jest.fn(),
    get: jest.fn(),
    getExpiry: jest.fn(),
    clear: jest.fn(),
  },
}));

const postMock = publicApiClient.post as jest.Mock;
const saveMock = refreshTokenStore.save as jest.Mock;
const loadMock = refreshTokenStore.load as jest.Mock;
const clearMock = refreshTokenStore.clear as jest.Mock;

function createTokenPair(
  accessToken = 'access-token',
  refreshToken = 'refresh-token',
): AuthTokenResponse {
  return {
    tokenType: 'Bearer',
    accessToken,
    expiresIn: 900,
    refreshToken,
    refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    identity: {
      id: 'identity-1',
      firebaseUid: 'firebase-1',
      phoneNumber: '+910000000000',
      email: null,
      emailVerified: false,
      displayName: null,
      status: 'ACTIVE',
      roles: ['CUSTOMER'],
      lastLoginAt: null,
    },
  };
}

describe('sessionManager', () => {
  beforeEach(() => {
    tokenMemory.clear();
    jest.resetAllMocks();
    loadMock.mockResolvedValue(null);
    saveMock.mockResolvedValue(undefined);
    clearMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    tokenMemory.clear();
  });

  it('persists the refresh credential before exposing the access token', async () => {
    const tokens = createTokenPair();
    saveMock.mockImplementation(async () => {
      expect(tokenMemory.get()).toBeNull();
    });

    await sessionManager.acceptTokenPair(tokens);

    expect(saveMock).toHaveBeenCalledWith(
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );
    expect(tokenMemory.get()).toBe(tokens.accessToken);
  });

  it('fails closed when secure persistence of a new token pair fails', async () => {
    tokenMemory.set('stale-access-token', 900);
    const persistenceError = new Error('secure-store unavailable');
    saveMock.mockRejectedValueOnce(persistenceError);

    await expect(
      sessionManager.acceptTokenPair(createTokenPair()),
    ).rejects.toBe(persistenceError);

    expect(tokenMemory.get()).toBeNull();
    expect(clearMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired refresh credential without calling the backend', async () => {
    loadMock.mockResolvedValue({
      refreshToken: 'expired-refresh-token',
      expiresAt: '2000-01-01T00:00:00.000Z',
    });

    await expect(sessionManager.refresh()).resolves.toBeNull();

    expect(postMock).not.toHaveBeenCalled();
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(tokenMemory.get()).toBeNull();
  });

  it('rotates refresh credentials before publishing the new access token', async () => {
    loadMock.mockResolvedValue({
      refreshToken: 'old-refresh-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    const rotated = createTokenPair('new-access-token', 'new-refresh-token');
    postMock.mockResolvedValue({data: rotated});
    saveMock.mockImplementation(async () => {
      expect(tokenMemory.get()).toBeNull();
    });

    await expect(sessionManager.refresh()).resolves.toEqual(rotated);

    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/auth/refresh',
      {refreshToken: 'old-refresh-token'},
      {timeout: 10000},
    );
    expect(saveMock).toHaveBeenCalledWith(
      rotated.refreshToken,
      rotated.refreshTokenExpiresAt,
    );
    expect(tokenMemory.get()).toBe(rotated.accessToken);
  });

  it('coalesces concurrent refresh attempts into one in-flight rotation', async () => {
    loadMock.mockResolvedValue({
      refreshToken: 'old-refresh-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    const rotated = createTokenPair('new-access-token', 'new-refresh-token');
    postMock.mockResolvedValue({data: rotated});

    const [first, second] = await Promise.all([
      sessionManager.refresh(),
      sessionManager.refresh(),
    ]);

    expect(first).toEqual(rotated);
    expect(second).toEqual(rotated);
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('clears and invalidates a backend-rejected refresh credential', async () => {
    tokenMemory.set('stale-access-token', 900);
    loadMock.mockResolvedValue({
      refreshToken: 'rejected-refresh-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    postMock.mockRejectedValueOnce(
      new AppApiError(
        'INVALID_REFRESH_TOKEN',
        'Your session could not be verified. Please sign in again.',
        401,
      ),
    );
    const listener = jest.fn();
    const unsubscribe = sessionManager.subscribeInvalidation(listener);

    await expect(sessionManager.refresh()).resolves.toBeNull();

    expect(tokenMemory.get()).toBeNull();
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('rejected_refresh_credential');
    unsubscribe();
  });

  it('preserves the saved refresh credential after a transient refresh failure', async () => {
    tokenMemory.set('still-usable-access-token', 900);
    loadMock.mockResolvedValue({
      refreshToken: 'saved-refresh-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    const networkError = new AppApiError(
      'NETWORK_ERROR',
      'We could not reach Craves. Check your connection and try again.',
      undefined,
      undefined,
      true,
    );
    postMock.mockRejectedValueOnce(networkError);

    await expect(sessionManager.refresh()).rejects.toBe(networkError);

    expect(clearMock).not.toHaveBeenCalled();
    expect(tokenMemory.get()).toBe('still-usable-access-token');
  });

  it('invalidates an authenticated runtime session that has no refresh credential', async () => {
    tokenMemory.set('access-token', 900);
    loadMock.mockResolvedValue(null);
    const listener = jest.fn();
    const unsubscribe = sessionManager.subscribeInvalidation(listener);

    await expect(sessionManager.refresh()).resolves.toBeNull();

    expect(tokenMemory.get()).toBeNull();
    expect(listener).toHaveBeenCalledWith('missing_refresh_credential');
    unsubscribe();
  });

  it('invalidates when rotated refresh state cannot be persisted', async () => {
    loadMock.mockResolvedValue({
      refreshToken: 'old-refresh-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    postMock.mockResolvedValue({
      data: createTokenPair('new-access-token', 'new-refresh-token'),
    });
    const persistenceError = new Error('secure-store unavailable');
    saveMock.mockRejectedValueOnce(persistenceError);
    const listener = jest.fn();
    const unsubscribe = sessionManager.subscribeInvalidation(listener);

    await expect(sessionManager.refresh()).rejects.toBe(persistenceError);

    expect(tokenMemory.get()).toBeNull();
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('refresh_persistence_failed');
    unsubscribe();
  });

  it('clears memory and secure refresh state on local logout cleanup', async () => {
    tokenMemory.set('access-token', 900);

    await sessionManager.clearLocal();

    expect(tokenMemory.get()).toBeNull();
    expect(clearMock).toHaveBeenCalledTimes(1);
  });
});
