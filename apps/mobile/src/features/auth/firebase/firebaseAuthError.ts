import {AppApiError} from '../../../core/http/apiError';

function firebaseErrorCode(error: unknown): string {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = (error as {code?: unknown}).code;
    if (typeof code === 'string' && code.trim()) {
      return code.trim();
    }
  }

  if (error instanceof Error && /^[A-Z0-9_./-]+$/i.test(error.message.trim())) {
    return error.message.trim();
  }

  return 'FIREBASE_AUTH_FAILED';
}

export function mapFirebaseAuthError(error: unknown): AppApiError {
  if (error instanceof AppApiError) {
    return error;
  }

  const code = firebaseErrorCode(error);

  if (
    code.includes('invalid-verification-code') ||
    code.includes('missing-verification-code')
  ) {
    return new AppApiError('INVALID_OTP', 'That verification code is not correct.');
  }

  if (
    code.includes('session-expired') ||
    code.includes('code-expired') ||
    code === 'OTP_CHALLENGE_MISSING' ||
    code === 'OTP_CONFIRMATION_FAILED'
  ) {
    return new AppApiError(
      'OTP_EXPIRED',
      'This verification request has expired. Request a new code to continue.',
    );
  }

  if (code.includes('too-many-requests') || code.includes('quota-exceeded')) {
    return new AppApiError(
      'OTP_RATE_LIMITED',
      'Too many verification attempts. Please wait before trying again.',
    );
  }

  if (code.includes('network-request-failed')) {
    return new AppApiError(
      'NETWORK_ERROR',
      'We could not reach the authentication service. Check your connection and try again.',
      undefined,
      undefined,
      true,
    );
  }

  if (code.includes('invalid-phone-number')) {
    return new AppApiError('INVALID_PHONE', 'Enter a valid phone number.');
  }

  if (
    code.includes('wrong-password') ||
    code.includes('invalid-credential') ||
    code.includes('user-not-found') ||
    code.includes('invalid-email')
  ) {
    return new AppApiError('INVALID_CREDENTIALS', 'The email or password is incorrect.');
  }

  if (code.includes('user-disabled')) {
    return new AppApiError('ACCOUNT_DISABLED', 'This account is currently unavailable.');
  }

  return new AppApiError('FIREBASE_AUTH_FAILED', 'Authentication could not be completed.');
}
