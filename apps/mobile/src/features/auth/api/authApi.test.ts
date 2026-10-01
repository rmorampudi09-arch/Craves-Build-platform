import { AppApiError } from '../../../core/http/apiError';
import { httpClient } from '../../../core/http/httpClient';
import { publicApiClient } from '../../../core/http/transport';
import type { AuthTokenResponse, Identity } from '../domain/types';
import { authApi } from './authApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

jest.mock('../../../core/http/transport', () => ({
  publicApiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('../../../core/security/refreshTokenStore', () => ({
  refreshTokenStore: {
    get: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;
const postMock = publicApiClient.post as jest.Mock;
const publicGetMock = publicApiClient.get as jest.Mock;

function createIdentity(): Identity {
  return {
    id: 'identity-1',
    firebaseUid: 'firebase-1',
    phoneNumber: '+910000000000',
    email: null,
    emailVerified: false,
    displayName: null,
    status: 'ACTIVE',
    roles: ['CUSTOMER'],
    lastLoginAt: null,
  };
}

function createTokenPair(): AuthTokenResponse {
  return {
    tokenType: 'Bearer',
    accessToken: 'craves-access-token',
    expiresIn: 900,
    refreshToken: 'craves-refresh-token',
    refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    identity: createIdentity(),
  };
}

describe('authApi exact auth contracts', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('loads only the live public MSG91 widget config without baked-in credentials', async () => {
    const config = {
      provider: 'msg91',
      widgetId: 'widget',
      tokenAuth: 'scoped-client-token',
    };
    publicGetMock.mockResolvedValue({ data: config });
    await expect(authApi.otpWidgetConfig()).resolves.toEqual(config);
    expect(publicGetMock).toHaveBeenCalledWith(
      'https://craves.in/api/auth/otp-config',
      {
        timeout: 10000,
        headers: { 'Cache-Control': 'no-cache' },
      },
    );
  });

  it.each([
    { provider: 'firebase' },
    { provider: 'msg91', widgetId: 'widget' },
    null,
  ])(
    'fails closed for disabled or incomplete MSG91 configuration: %p',
    async data => {
      publicGetMock.mockResolvedValue({ data });
      await expect(authApi.otpWidgetConfig()).rejects.toMatchObject({
        code: 'OTP_UNAVAILABLE',
      });
    },
  );

  it('posts only the provider-verified token to the exact backend bridge route', async () => {
    const customToken = 'c'.repeat(100);
    postMock.mockResolvedValue({ data: { firebaseCustomToken: customToken } });
    await expect(authApi.verifyMsg91Token('msg91-access-token')).resolves.toBe(
      customToken,
    );
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/auth/msg91/verify',
      { accessToken: 'msg91-access-token' },
      { timeout: 15000 },
    );
  });

  it.each([
    {},
    { firebaseCustomToken: 'short' },
    { accessToken: 'wrong-contract' },
    null,
  ])(
    'rejects malformed backend verification without accepting a session: %p',
    async data => {
      postMock.mockResolvedValue({ data });
      await expect(
        authApi.verifyMsg91Token('verified-token'),
      ).rejects.toMatchObject({ code: 'OTP_RESTART' });
    },
  );

  it('posts the exact approved Firebase exchange request with a bounded timeout', async () => {
    const tokens = createTokenPair();
    postMock.mockResolvedValue({ data: tokens });

    await expect(
      authApi.exchangeFirebaseToken('firebase-id-token'),
    ).resolves.toEqual(tokens);

    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/auth/firebase/exchange',
      { firebaseIdToken: 'firebase-id-token' },
      { timeout: 10000 },
    );
  });

  it('maps GET /api/v1/auth/me from the approved MeResponse envelope', async () => {
    const identity = createIdentity();
    getMock.mockResolvedValue({ identity });

    await expect(authApi.me()).resolves.toEqual(identity);

    expect(getMock).toHaveBeenCalledWith('/api/v1/auth/me');
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
