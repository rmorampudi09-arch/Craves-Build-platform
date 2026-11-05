jest.mock('@react-native-firebase/auth', () => ({
  EmailAuthProvider: {credential: jest.fn()},
  getAuth: jest.fn(() => ({currentUser: null})),
  getIdToken: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithPhoneNumber: jest.fn(),
  signOut: jest.fn(),
  updatePassword: jest.fn(),
}));

import {getIdToken, signInWithPhoneNumber} from '@react-native-firebase/auth';
import {firebaseAuth} from './firebaseAuth';

const signInWithPhoneNumberMock = signInWithPhoneNumber as jest.Mock;
const getIdTokenMock = getIdToken as jest.Mock;

describe('firebaseAuth native adapter parity guards', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await firebaseAuth.signOut();
  });

  it('clears a stale OTP confirmation before starting a new native phone challenge', async () => {
    signInWithPhoneNumberMock.mockResolvedValueOnce({
      confirm: jest.fn(),
    });

    await firebaseAuth.beginPhoneSignIn('+919999999999');
    expect(firebaseAuth.hasPendingOtp()).toBe(true);

    signInWithPhoneNumberMock.mockRejectedValueOnce(new Error('auth/network-request-failed'));

    await expect(firebaseAuth.beginPhoneSignIn('+918888888888')).rejects.toThrow(
      'auth/network-request-failed',
    );
    expect(firebaseAuth.hasPendingOtp()).toBe(false);
  });

  it('clears a malformed native OTP confirmation instead of leaving a dead challenge', async () => {
    signInWithPhoneNumberMock.mockResolvedValueOnce({
      confirm: jest.fn(async () => null),
    });

    await firebaseAuth.beginPhoneSignIn('+919999999999');
    await expect(firebaseAuth.confirmOtp('123456')).rejects.toThrow(
      'OTP_CONFIRMATION_FAILED',
    );
    expect(firebaseAuth.hasPendingOtp()).toBe(false);
  });

  it('returns a fresh Firebase ID token after a valid native OTP confirmation', async () => {
    const user = {uid: 'firebase-user-1'};
    signInWithPhoneNumberMock.mockResolvedValueOnce({
      confirm: jest.fn(async () => ({user})),
    });
    getIdTokenMock.mockResolvedValueOnce('firebase-id-token');

    await firebaseAuth.beginPhoneSignIn('+919999999999');

    await expect(firebaseAuth.confirmOtp('123456')).resolves.toBe(
      'firebase-id-token',
    );
    expect(getIdTokenMock).toHaveBeenCalledWith(user, true);
    expect(firebaseAuth.hasPendingOtp()).toBe(false);
  });
});
