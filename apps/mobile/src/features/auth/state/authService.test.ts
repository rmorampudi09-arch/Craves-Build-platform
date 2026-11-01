import {AppApiError} from '../../../core/http/apiError';
import {authApi} from '../api/authApi';
import {sessionManager} from '../api/sessionManager';
import type {AuthTokenResponse} from '../domain/types';
import {firebaseAuth} from '../firebase/firebaseAuth';
import {authService} from './authService';

jest.mock('../api/authApi', () => ({
  authApi: {
    exchangeFirebaseToken: jest.fn(),
    sendPhoneOtp: jest.fn(),
    verifyPhoneOtp: jest.fn(),
    me: jest.fn(),
    logout: jest.fn(),
  },
}));

jest.mock('../api/sessionManager', () => ({
  sessionManager: {
    acceptTokenPair: jest.fn(),
    restore: jest.fn(),
    refresh: jest.fn(),
    clearLocal: jest.fn(),
  },
}));

jest.mock('../firebase/firebaseAuth', () => ({
  firebaseAuth: {
    beginPhoneSignIn: jest.fn(),
    confirmOtp: jest.fn(),
    signInWithCustomToken: jest.fn(),
    signInWithEmail: jest.fn(),
    sendPasswordReset: jest.fn(),
    signOut: jest.fn(),
    hasPendingOtp: jest.fn(),
  },
}));

const exchangeMock = authApi.exchangeFirebaseToken as jest.Mock;
const acceptTokenPairMock = sessionManager.acceptTokenPair as jest.Mock;
const clearLocalMock = sessionManager.clearLocal as jest.Mock;
const confirmOtpMock = firebaseAuth.confirmOtp as jest.Mock;
const emailSignInMock = firebaseAuth.signInWithEmail as jest.Mock;
const signOutMock = firebaseAuth.signOut as jest.Mock;

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
      email: 'person@example.com',
      emailVerified: true,
      displayName: 'Person',
      status: 'ACTIVE',
      roles: ['CUSTOMER'],
      lastLoginAt: null,
    },
  };
}

describe('authService Firebase to CRAVES exchange and restore cleanup', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    acceptTokenPairMock.mockResolvedValue(undefined);
    clearLocalMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue(undefined);
  });

  it('exchanges the verified OTP Firebase token and accepts the CRAVES token pair', async () => {
    const tokens = createTokenPair();
    confirmOtpMock.mockResolvedValue('firebase-id-token');
    exchangeMock.mockResolvedValue(tokens);

    await expect(authService.confirmOtp('123456')).resolves.toEqual(tokens);

    expect(exchangeMock).toHaveBeenCalledWith('firebase-id-token');
    expect(acceptTokenPairMock).toHaveBeenCalledWith(tokens);
    expect(clearLocalMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('uses the same CRAVES exchange boundary after verified email sign-in', async () => {
    const tokens = createTokenPair();
    emailSignInMock.mockResolvedValue('firebase-email-id-token');
    exchangeMock.mockResolvedValue(tokens);

    await expect(
      authService.emailLogin('person@example.com', 'password'),
    ).resolves.toEqual(tokens);

    expect(exchangeMock).toHaveBeenCalledWith('firebase-email-id-token');
    expect(acceptTokenPairMock).toHaveBeenCalledWith(tokens);
  });

  it('clears CRAVES and Firebase state when the exchange request fails', async () => {
    const exchangeError = new AppApiError(
      'FIREBASE_TOKEN_INVALID',
      'Your session could not be verified. Please sign in again.',
      401,
      'correlation-1',
    );
    confirmOtpMock.mockResolvedValue('firebase-id-token');
    exchangeMock.mockRejectedValue(exchangeError);

    await expect(authService.confirmOtp('123456')).rejects.toBe(exchangeError);

    expect(acceptTokenPairMock).not.toHaveBeenCalled();
    expect(clearLocalMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when secure acceptance of the CRAVES token pair fails', async () => {
    const tokens = createTokenPair();
    confirmOtpMock.mockResolvedValue('firebase-id-token');
    exchangeMock.mockResolvedValue(tokens);
    acceptTokenPairMock.mockRejectedValue(new Error('secure-store unavailable'));

    await expect(authService.confirmOtp('123456')).rejects.toMatchObject({
      code: 'FIREBASE_AUTH_FAILED',
    });

    expect(clearLocalMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('cleans up before applying the email missing-phone recovery path', async () => {
    emailSignInMock.mockResolvedValue('firebase-email-id-token');
    exchangeMock.mockRejectedValue(
      new AppApiError(
        'PHONE_NUMBER_MISSING',
        'Your session could not be verified. Please sign in again.',
        401,
        'correlation-2',
      ),
    );

    await expect(
      authService.emailLogin('person@example.com', 'password'),
    ).rejects.toMatchObject({code: 'PHONE_VERIFICATION_REQUIRED'});

    expect(clearLocalMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('discards retained local authentication before leaving startup recovery', async () => {
    clearLocalMock.mockRejectedValueOnce(new Error('secure-store unavailable'));

    await expect(authService.discardRestoredSession()).resolves.toBeUndefined();

    expect(clearLocalMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});

describe('authService phone OTP by MSG91', () => {
  const sendMock = authApi.sendPhoneOtp as jest.Mock;
  const verifyMock = authApi.verifyPhoneOtp as jest.Mock;
  const customTokenMock = firebaseAuth.signInWithCustomToken as jest.Mock;
  const first = 'a'.repeat(43);
  const second = 'b'.repeat(43);

  beforeEach(async () => {
    jest.resetAllMocks();
    acceptTokenPairMock.mockResolvedValue(undefined);
    clearLocalMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue(undefined);
    // Leave no challenge from an earlier test: a used one is cleared by a successful verify.
    sendMock.mockResolvedValue({challengeId: 'z'.repeat(43), autoRead: false});
    verifyMock.mockResolvedValue('custom-token');
    customTokenMock.mockResolvedValue('firebase-id-token');
    exchangeMock.mockResolvedValue(createTokenPair());
    await authService.beginMsg91Phone('+919000000000');
    await authService.confirmMsg91Otp('000000');
    jest.resetAllMocks();
    acceptTokenPairMock.mockResolvedValue(undefined);
    clearLocalMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue(undefined);
  });

  it('sends, verifies, signs in with the custom token and exchanges it', async () => {
    const tokens = createTokenPair();
    sendMock.mockResolvedValue({challengeId: first, autoRead: false});
    verifyMock.mockResolvedValue('custom-token');
    customTokenMock.mockResolvedValue('firebase-id-token');
    exchangeMock.mockResolvedValue(tokens);

    await expect(authService.beginMsg91Phone('+919848012345')).resolves.toEqual({autoRead: false});
    expect(sendMock).toHaveBeenCalledWith('9848012345', undefined, undefined);
    await expect(authService.confirmMsg91Otp('482913')).resolves.toEqual(tokens);
    expect(verifyMock).toHaveBeenCalledWith(first, '482913', undefined);
    expect(customTokenMock).toHaveBeenCalledWith('custom-token');
    expect(exchangeMock).toHaveBeenCalledWith('firebase-id-token');
    expect(acceptTokenPairMock).toHaveBeenCalledWith(tokens);
  });

  it("passes the rider app's client to both calls and answers whether the SMS reads itself", async () => {
    const rider = {app: 'rider' as const, installationId: 'a1b2c3d4e5f60718'};
    sendMock.mockResolvedValueOnce({challengeId: first, autoRead: true});
    await expect(authService.beginMsg91Phone('+919848012345', rider)).resolves.toEqual({autoRead: true});
    expect(sendMock).toHaveBeenCalledWith('9848012345', undefined, rider);
    // A restart sends the client again, and the new answer stands.
    sendMock.mockRejectedValueOnce(new AppApiError('OTP_RESTART', 'Start again')).mockResolvedValueOnce({challengeId: second, autoRead: false});
    await expect(authService.beginMsg91Phone('+919848012345', rider)).resolves.toEqual({autoRead: false});
    expect(sendMock).toHaveBeenLastCalledWith('9848012345', undefined, rider);
    verifyMock.mockResolvedValue('custom-token');
    customTokenMock.mockResolvedValue('id');
    exchangeMock.mockResolvedValue(createTokenPair());
    await authService.confirmMsg91Otp('482913', rider);
    expect(verifyMock).toHaveBeenCalledWith(second, '482913', rider);
  });

  it('resends on the same challenge, and starts again when the server no longer knows it', async () => {
    sendMock.mockResolvedValueOnce({challengeId: first, autoRead: false}).mockResolvedValueOnce({challengeId: first, autoRead: false});
    await authService.beginMsg91Phone('+919848012345');
    await authService.beginMsg91Phone('+919848012345');
    expect(sendMock).toHaveBeenLastCalledWith('9848012345', first, undefined);

    sendMock.mockRejectedValueOnce(new AppApiError('OTP_RESTART', 'Start again')).mockResolvedValueOnce({challengeId: second, autoRead: false});
    await authService.beginMsg91Phone('+919848012345');
    expect(sendMock).toHaveBeenLastCalledWith('9848012345', undefined, undefined);
    verifyMock.mockResolvedValue('custom-token');
    customTokenMock.mockResolvedValue('id');
    exchangeMock.mockResolvedValue(createTokenPair());
    await authService.confirmMsg91Otp('482913');
    expect(verifyMock).toHaveBeenCalledWith(second, '482913', undefined);
  });

  it('keeps the challenge after a wrong code and drops it after any other failure', async () => {
    sendMock.mockResolvedValue({challengeId: first, autoRead: false});
    await authService.beginMsg91Phone('+919848012345');
    verifyMock.mockRejectedValueOnce(new AppApiError('OTP_INVALID', 'Wrong code'));
    await expect(authService.confirmMsg91Otp('111111')).rejects.toMatchObject({code: 'OTP_INVALID'});

    verifyMock.mockRejectedValueOnce(new AppApiError('OTP_RESTART', 'Start again'));
    await expect(authService.confirmMsg91Otp('222222')).rejects.toMatchObject({code: 'OTP_RESTART'});
    expect(verifyMock).toHaveBeenNthCalledWith(2, first, '222222', undefined);

    await expect(authService.confirmMsg91Otp('333333')).rejects.toMatchObject({code: 'OTP_EXPIRED'});
    expect(verifyMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the challenge after the verify rate limit, so the next Verify works without a resend', async () => {
    sendMock.mockResolvedValue({challengeId: first, autoRead: false});
    await authService.beginMsg91Phone('+919848012345');
    verifyMock.mockRejectedValueOnce(new AppApiError('OTP_RATE_LIMIT', 'Too many tries', 429));
    await expect(authService.confirmMsg91Otp('111111')).rejects.toMatchObject({code: 'OTP_RATE_LIMIT'});

    verifyMock.mockResolvedValueOnce('custom-token');
    customTokenMock.mockResolvedValue('id');
    exchangeMock.mockResolvedValue(createTokenPair());
    await expect(authService.confirmMsg91Otp('482913')).resolves.toEqual(createTokenPair());
    expect(verifyMock).toHaveBeenNthCalledWith(2, first, '482913', undefined);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('passes cooldown and resend-limit refusals through without starting again', async () => {
    sendMock.mockResolvedValueOnce({challengeId: first, autoRead: false});
    await authService.beginMsg91Phone('+919848012345');
    sendMock.mockRejectedValueOnce(new AppApiError('OTP_COOLDOWN', 'Wait'));
    await expect(authService.beginMsg91Phone('+919848012345')).rejects.toMatchObject({code: 'OTP_COOLDOWN'});
    sendMock.mockRejectedValueOnce(new AppApiError('OTP_RESEND_LIMIT', 'Limit'));
    await expect(authService.beginMsg91Phone('+919848012345')).rejects.toMatchObject({code: 'OTP_RESEND_LIMIT'});
    expect(sendMock).toHaveBeenCalledTimes(3);
  });
});
