import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {sessionManager} from '../api/sessionManager';
import {authApi} from '../api/authApi';
import {firebaseAuth} from '../firebase/firebaseAuth';
import {
  mapFirebaseAuthError,
  mapPasswordRecoveryFirebaseError,
} from '../firebase/firebaseAuthError';
import type {AuthRole, AuthTokenResponse} from '../domain/types';

async function clearPartialAuthentication(): Promise<void> {
  await Promise.allSettled([sessionManager.clearLocal(), firebaseAuth.signOut()]);
}

async function exchangeAndPersist(firebaseIdToken: string): Promise<AuthTokenResponse> {
  try {
    const tokens = await authApi.exchangeFirebaseToken(firebaseIdToken);
    await sessionManager.acceptTokenPair(tokens);
    return tokens;
  } catch (error) {
    await clearPartialAuthentication();
    throw error;
  }
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
      throw mapFirebaseAuthError(error);
    }
  },
  async confirmOtp(code: string): Promise<AuthTokenResponse> {
    try {
      const firebaseIdToken = await firebaseAuth.confirmOtp(code);
      return await exchangeAndPersist(firebaseIdToken);
    } catch (error) {
      throw mapFirebaseAuthError(error);
    }
  },
  async emailLogin(email: string, password: string): Promise<AuthTokenResponse> {
    try {
      const firebaseIdToken = await firebaseAuth.signInWithEmail(email, password);
      return await exchangeAndPersist(firebaseIdToken);
    } catch (error) {
      const mapped = mapFirebaseAuthError(error);
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
      const mapped = mapPasswordRecoveryFirebaseError(error);
      if (mapped) {
        throw mapped;
      }
      // Account-specific provider outcomes intentionally resolve through the same
      // neutral success path as an accepted password-reset request.
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
