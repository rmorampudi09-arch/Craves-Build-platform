import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {publicApiClient} from '../../../core/http/transport';
import type {AuthTokenResponse, Identity} from '../domain/types';
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

const getMock = httpClient.get as jest.Mock;
const postMock = publicApiClient.post as jest.Mock;

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

  it('maps GET /api/v1/auth/me from the approved MeResponse envelope', async () => {
    const identity = createIdentity();
    getMock.mockResolvedValue({identity});

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

  describe('central phone OTP (MSG91)', () => {
    const challengeId = 'c'.repeat(43);
    const customToken = 't'.repeat(200);

    it('sends the 10 digits with country code 91, and the challenge on a resend', async () => {
      postMock.mockResolvedValue({data: {challengeId, expiresAt: 1, resendAvailableAt: 2}});
      await expect(authApi.sendPhoneOtp('9848012345')).resolves.toEqual({challengeId, autoRead: false});
      expect(postMock).toHaveBeenCalledWith(
        '/api/v1/auth/otp/send',
        {phoneNumber: '9848012345', countryCode: '91'},
        {timeout: 15000, headers: {}},
      );
      await authApi.sendPhoneOtp('9848012345', challengeId);
      expect(postMock).toHaveBeenLastCalledWith(
        '/api/v1/auth/otp/send',
        {phoneNumber: '9848012345', countryCode: '91', challengeId},
        {timeout: 15000, headers: {}},
      );
    });

    it('names the rider app and its install, and reads the code with no tap only when the server says so', async () => {
      const rider = {app: 'rider' as const, installationId: 'a1b2c3d4e5f60718'};
      const headers = {'X-Craves-App': 'rider', 'X-Craves-Installation-Id': 'a1b2c3d4e5f60718'};
      postMock.mockResolvedValue({data: {challengeId, expiresAt: 1, resendAvailableAt: 2, autoRead: true}});
      await expect(authApi.sendPhoneOtp('9848012345', undefined, rider)).resolves.toEqual({challengeId, autoRead: true});
      expect(postMock).toHaveBeenLastCalledWith('/api/v1/auth/otp/send', expect.anything(), {timeout: 15000, headers});
      postMock.mockResolvedValue({data: {challengeId, expiresAt: 1, resendAvailableAt: 2, autoRead: 'true'}});
      await expect(authApi.sendPhoneOtp('9848012345', undefined, rider)).resolves.toEqual({challengeId, autoRead: false});
      postMock.mockResolvedValue({data: {firebaseCustomToken: customToken}});
      await authApi.verifyPhoneOtp(challengeId, '482913', rider);
      expect(postMock).toHaveBeenLastCalledWith('/api/v1/auth/otp/verify', {challengeId, otp: '482913'}, {timeout: 15000, headers});
      // No install id without the rider native module: the header is left out, not sent empty.
      await authApi.verifyPhoneOtp(challengeId, '482913', {app: 'rider', installationId: null});
      expect(postMock).toHaveBeenLastCalledWith('/api/v1/auth/otp/verify', expect.anything(), {
        timeout: 15000,
        headers: {'X-Craves-App': 'rider'},
      });
    });

    it('verifies the code and answers the Firebase custom token', async () => {
      postMock.mockResolvedValue({data: {firebaseCustomToken: customToken}});
      await expect(authApi.verifyPhoneOtp(challengeId, '482913')).resolves.toBe(customToken);
      expect(postMock).toHaveBeenCalledWith('/api/v1/auth/otp/verify', {challengeId, otp: '482913'}, {timeout: 15000, headers: {}});
    });

    it('refuses answers that are not the expected shape', async () => {
      postMock.mockResolvedValue({data: {challengeId: 'short'}});
      await expect(authApi.sendPhoneOtp('9848012345')).rejects.toMatchObject({code: 'OTP_UNAVAILABLE'});
      postMock.mockResolvedValue({data: {firebaseCustomToken: 'short'}});
      await expect(authApi.verifyPhoneOtp(challengeId, '482913')).rejects.toMatchObject({code: 'OTP_UNAVAILABLE'});
    });
  });
});
