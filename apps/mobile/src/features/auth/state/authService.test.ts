import {AppApiError} from '../../../core/http/apiError';
import {authApi} from '../api/authApi';
import {sessionManager} from '../api/sessionManager';
import type {AuthTokenResponse} from '../domain/types';
import {firebaseAuth} from '../firebase/firebaseAuth';
import {authService} from './authService';

jest.mock('../api/authApi', () => ({
  authApi: {
    exchangeFirebaseToken: jest.fn(),
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

describe('authService P19 Firebase to CRAVES exchange', () => {
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
});
