import { AppApiError } from '../../../core/http/apiError';
import { authApi } from '../api/authApi';
import { sessionManager } from '../api/sessionManager';
import type { AuthTokenResponse } from '../domain/types';
import { firebaseAuth } from '../firebase/firebaseAuth';
import { msg91Auth } from '../msg91/msg91Auth';
import { authService } from './authService';

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
    signInWithBackendToken: jest.fn(),
    signInWithEmail: jest.fn(),
    sendPasswordReset: jest.fn(),
    signOut: jest.fn(),
  },
}));

jest.mock('../msg91/msg91Auth', () => ({
  msg91Auth: {
    beginPhoneSignIn: jest.fn(),
    resendOtp: jest.fn(),
    confirmOtp: jest.fn(),
    resendAvailableAt: jest.fn(),
    cancel: jest.fn(),
  },
}));

const exchangeMock = authApi.exchangeFirebaseToken as jest.Mock;
const acceptTokenPairMock = sessionManager.acceptTokenPair as jest.Mock;
const clearLocalMock = sessionManager.clearLocal as jest.Mock;
const bridgeSignInMock = firebaseAuth.signInWithBackendToken as jest.Mock;
const confirmOtpMock = msg91Auth.confirmOtp as jest.Mock;
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

describe('authService MSG91 to existing CRAVES identity/session contract', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    acceptTokenPairMock.mockResolvedValue(undefined);
    clearLocalMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue(undefined);
    confirmOtpMock.mockImplementation(async (_code, complete) =>
      complete('backend-custom-token', () => {}),
    );
    bridgeSignInMock.mockResolvedValue('firebase-id-token');
  });

  it('verifies MSG91 on the backend, accepts its compatibility token, then persists the CRAVES session', async () => {
    const tokens = createTokenPair();
    exchangeMock.mockResolvedValue(tokens);

    await expect(authService.confirmOtp('123456')).resolves.toEqual(tokens);

    expect(exchangeMock).toHaveBeenCalledWith('firebase-id-token');
    expect(bridgeSignInMock).toHaveBeenCalledWith('backend-custom-token');
    expect(bridgeSignInMock.mock.invocationCallOrder[0]).toBeLessThan(
      exchangeMock.mock.invocationCallOrder[0],
    );
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
    exchangeMock.mockRejectedValue(exchangeError);

    await expect(authService.confirmOtp('123456')).rejects.toMatchObject({
      code: 'OTP_RESTART',
      correlationId: 'correlation-1',
    });

    expect(acceptTokenPairMock).not.toHaveBeenCalled();
    expect(clearLocalMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when secure acceptance of the CRAVES token pair fails', async () => {
    const tokens = createTokenPair();
    exchangeMock.mockResolvedValue(tokens);
    acceptTokenPairMock.mockRejectedValue(
      new Error('secure-store unavailable'),
    );

    await expect(authService.confirmOtp('123456')).rejects.toMatchObject({
      code: 'OTP_RESTART',
    });

    expect(clearLocalMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('never starts identity exchange for a rejected provider OTP', async () => {
    const error = new AppApiError('OTP_VERIFICATION_FAILED', 'Check the code.');
    confirmOtpMock.mockRejectedValue(error);
    await expect(authService.confirmOtp('000000')).rejects.toBe(error);
    expect(bridgeSignInMock).not.toHaveBeenCalled();
    expect(acceptTokenPairMock).not.toHaveBeenCalled();
  });

  it('does not accept an unverified or replayed backend challenge', async () => {
    confirmOtpMock.mockRejectedValue(
      new AppApiError('OTP_TOKEN_REPLAYED', 'Request a new code.', 409),
    );
    await expect(authService.confirmOtp('123456')).rejects.toMatchObject({
      code: 'OTP_TOKEN_REPLAYED',
    });
    expect(bridgeSignInMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(acceptTokenPairMock).not.toHaveBeenCalled();
    expect(clearLocalMock).not.toHaveBeenCalled();
  });

  it('rejects a cancelled attempt before signing into the compatibility provider', async () => {
    const assertCurrent = () => {
      throw new AppApiError(
        'OTP_CANCELLED',
        'Cancelled.',
        undefined,
        undefined,
        false,
        true,
      );
    };
    confirmOtpMock.mockImplementation(async (_code, complete) =>
      complete('msg91-access-token', assertCurrent),
    );
    await expect(authService.confirmOtp('123456')).rejects.toMatchObject({
      code: 'OTP_CANCELLED',
    });
    expect(bridgeSignInMock).not.toHaveBeenCalled();
    expect(acceptTokenPairMock).not.toHaveBeenCalled();
  });

  it('uses MSG91 for either selected role and retries the existing challenge', async () => {
    (msg91Auth.beginPhoneSignIn as jest.Mock).mockResolvedValue(undefined);
    (msg91Auth.resendOtp as jest.Mock).mockResolvedValue(undefined);
    await expect(
      authService.beginPhone('CHEF', '+919876543210'),
    ).resolves.toEqual({ role: 'CHEF', phone: '+919876543210' });
    await authService.resendOtp('+919876543210');
    expect(msg91Auth.beginPhoneSignIn).toHaveBeenCalledWith('+919876543210');
    expect(msg91Auth.resendOtp).toHaveBeenCalledWith('+919876543210');
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
    ).rejects.toMatchObject({ code: 'PHONE_VERIFICATION_REQUIRED' });

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
