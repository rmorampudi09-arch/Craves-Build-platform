import {AppApiError} from '../../../core/http/apiError';
import {publicApiClient} from '../../../core/http/transport';
import type {AuthTokenResponse} from '../domain/types';
import {authApi} from './authApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

jest.mock('../../../core/http/transport', () => ({
  publicApiClient: {
    post: jest.fn(),
  },
}));

jest.mock('../../../core/security/refreshTokenStore', () => ({
  refreshTokenStore: {
    get: jest.fn(),
  },
}));

const postMock = publicApiClient.post as jest.Mock;

function createTokenPair(): AuthTokenResponse {
  return {
    tokenType: 'Bearer',
    accessToken: 'craves-access-token',
    expiresIn: 900,
    refreshToken: 'craves-refresh-token',
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

describe('authApi P19 Firebase exchange contract', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('posts the exact approved Firebase exchange request with a bounded timeout', async () => {
    const tokens = createTokenPair();
    postMock.mockResolvedValue({data: tokens});

    await expect(
      authApi.exchangeFirebaseToken('firebase-id-token'),
    ).resolves.toEqual(tokens);

    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/auth/firebase/exchange',
      {firebaseIdToken: 'firebase-id-token'},
      {timeout: 10000},
    );
  });

  it('preserves the shared transport error including correlation evidence', async () => {
    const error = new AppApiError(
      'FIREBASE_TOKEN_INVALID',
      'Your session could not be verified. Please sign in again.',
      401,
      'correlation-123',
    );
    postMock.mockRejectedValue(error);

    await expect(
      authApi.exchangeFirebaseToken('invalid-firebase-id-token'),
    ).rejects.toBe(error);
  });
});
