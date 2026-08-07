import axios from 'axios';
import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {sessionManager} from '../api/sessionManager';
import {authApi} from '../api/authApi';
import {firebaseAuth} from '../firebase/firebaseAuth';
import type {AuthRole, AuthTokenResponse} from '../domain/types';

async function exchangeAndPersist(firebaseIdToken: string): Promise<AuthTokenResponse> {
  const tokens = await authApi.exchangeFirebaseToken(firebaseIdToken);
  await sessionManager.acceptTokenPair(tokens);
  return tokens;
}

function mapFirebaseError(error: unknown): AppApiError {
  if (axios.isAxiosError(error)) {
    return toAppApiError(error);
  }
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as {code?: unknown}).code)
      : 'FIREBASE_AUTH_FAILED';
  if (code.includes('invalid-verification-code')) {
    return new AppApiError('INVALID_OTP', 'That verification code is not correct.');
  }
  if (code.includes('too-many-requests')) {
    return new AppApiError('OTP_RATE_LIMITED', 'Too many attempts. Please wait and try again.');
  }
  if (code.includes('invalid-phone-number')) {
    return new AppApiError('INVALID_PHONE', 'Enter a valid phone number.');
  }
  if (code.includes('wrong-password') || code.includes('invalid-credential')) {
    return new AppApiError('INVALID_CREDENTIALS', 'The email or password is incorrect.');
  }
  if (code.includes('user-disabled')) {
    return new AppApiError('ACCOUNT_DISABLED', 'This account is currently unavailable.');
  }
  return new AppApiError('FIREBASE_AUTH_FAILED', 'Authentication could not be completed.');
}

export const authService = {
  async restore() {
    try {
      return await sessionManager.restore();
    } catch (error) {
      throw toAppApiError(error);
    }
  },
  async beginPhone(role: AuthRole, e164Phone: string): Promise<{role: AuthRole; phone: string}> {
    try {
      await firebaseAuth.beginPhoneSignIn(e164Phone);
      return {role, phone: e164Phone};
    } catch (error) {
      throw mapFirebaseError(error);
    }
  },
  async confirmOtp(code: string): Promise<AuthTokenResponse> {
    try {
      const firebaseIdToken = await firebaseAuth.confirmOtp(code);
      return await exchangeAndPersist(firebaseIdToken);
    } catch (error) {
      if (error instanceof AppApiError) {
        throw error;
      }
      throw mapFirebaseError(error);
    }
  },
  async emailLogin(email: string, password: string): Promise<AuthTokenResponse> {
    try {
      const firebaseIdToken = await firebaseAuth.signInWithEmail(email, password);
      return await exchangeAndPersist(firebaseIdToken);
    } catch (error) {
      const mapped = mapFirebaseError(error);
      if (mapped.code === 'PHONE_NUMBER_MISSING') {
        return Promise.reject(
          new AppApiError(
            'PHONE_VERIFICATION_REQUIRED',
            'This Craves account must have a verified phone number before email sign-in can continue.',
          ),
        );
      }
      throw mapped;
    }
  },
  async sendPasswordReset(email: string): Promise<void> {
    try {
      await firebaseAuth.sendPasswordReset(email);
    } catch (error) {
      throw mapFirebaseError(error);
    }
  },
  async logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // Remote revocation is best-effort on logout; local credentials are always cleared below.
    } finally {
      await Promise.allSettled([sessionManager.clearLocal(), firebaseAuth.signOut()]);
    }
  },
};
