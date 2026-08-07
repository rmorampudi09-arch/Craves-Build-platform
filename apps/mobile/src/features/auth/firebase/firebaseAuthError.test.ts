import {AppApiError} from '../../../core/http/apiError';
import {mapFirebaseAuthError} from './firebaseAuthError';

describe('Firebase auth error mapping', () => {
  it('maps invalid verification codes without exposing provider text', () => {
    expect(mapFirebaseAuthError({code: 'auth/invalid-verification-code'})).toMatchObject({
      code: 'INVALID_OTP',
      message: 'That verification code is not correct.',
    });
  });

  it('maps provider expiry and a lost in-memory challenge to resend recovery', () => {
    expect(mapFirebaseAuthError({code: 'auth/session-expired'}).code).toBe('OTP_EXPIRED');
    expect(mapFirebaseAuthError(new Error('OTP_CHALLENGE_MISSING')).code).toBe('OTP_EXPIRED');
  });

  it('maps provider throttling and quota errors to one public rate-limit state', () => {
    expect(mapFirebaseAuthError({code: 'auth/too-many-requests'}).code).toBe(
      'OTP_RATE_LIMITED',
    );
    expect(mapFirebaseAuthError({code: 'auth/quota-exceeded'}).code).toBe(
      'OTP_RATE_LIMITED',
    );
  });

  it('keeps Firebase network failures actionable and retriable', () => {
    expect(mapFirebaseAuthError({code: 'auth/network-request-failed'})).toMatchObject({
      code: 'NETWORK_ERROR',
      retriable: true,
    });
  });

  it('preserves non-disclosing email credential errors from P15/P16', () => {
    expect(mapFirebaseAuthError({code: 'auth/user-not-found'})).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'The email or password is incorrect.',
    });
  });

  it('does not remap normalized application API errors', () => {
    const existing = new AppApiError('PHONE_NUMBER_MISSING', 'Phone verification required.');
    expect(mapFirebaseAuthError(existing)).toBe(existing);
  });
});
