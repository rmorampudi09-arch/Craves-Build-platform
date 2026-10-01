import { AppApiError, toAppApiError } from '../../../core/http/apiError';
import { sessionManager } from '../api/sessionManager';
import { authApi } from '../api/authApi';
import { firebaseAuth } from '../firebase/firebaseAuth';
import { msg91Auth } from '../msg91/msg91Auth';
import {
  mapFirebaseAuthError,
  mapPasswordRecoveryFirebaseError,
} from '../firebase/firebaseAuthError';
import type { AuthRole, AuthTokenResponse } from '../domain/types';

async function clearPartialAuthentication(): Promise<void> {
  msg91Auth.cancel();
  await Promise.allSettled([
    sessionManager.clearLocal(),
    firebaseAuth.signOut(),
  ]);
}

async function exchangeAndPersist(
  firebaseIdToken: string,
): Promise<AuthTokenResponse> {
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
  async discardRestoredSession(): Promise<void> {
    await clearPartialAuthentication();
  },
  async beginPhone(
    role: AuthRole,
    e164Phone: string,
  ): Promise<{ role: AuthRole; phone: string }> {
    try {
      await msg91Auth.beginPhoneSignIn(e164Phone);
      return { role, phone: e164Phone };
    } catch (error) {
      throw mapFirebaseAuthError(error);
    }
  },
  async resendOtp(phone: string): Promise<void> {
    await msg91Auth.resendOtp(phone);
  },
  otpResendAvailableAt(): number {
    return msg91Auth.resendAvailableAt();
  },
  cancelPhoneVerification(): void {
    msg91Auth.cancel();
  },
  async confirmOtp(code: string): Promise<AuthTokenResponse> {
    return msg91Auth.confirmOtp(code, async (accessToken, assertCurrent) => {
      try {
        const customToken = await authApi.verifyMsg91Token(accessToken);
        assertCurrent();
        const firebaseIdToken = await firebaseAuth.signInWithBackendToken(
          customToken,
        );
        assertCurrent();
        const tokens = await authApi.exchangeFirebaseToken(firebaseIdToken);
        assertCurrent();
        await sessionManager.acceptTokenPair(tokens);
        assertCurrent();
        return tokens;
      } catch (error) {
        await clearPartialAuthentication();
        const mapped = mapFirebaseAuthError(error);
        if (mapped.cancelled) {
          throw mapped;
        }
        throw new AppApiError(
          'OTP_RESTART',
          'Sign-in could not be completed. Go back and request a new code.',
          mapped.status,
          mapped.correlationId,
        );
      }
    });
  },
  async emailLogin(
    email: string,
    password: string,
  ): Promise<AuthTokenResponse> {
    try {
      const firebaseIdToken = await firebaseAuth.signInWithEmail(
        email,
        password,
      );
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
      await clearPartialAuthentication();
    }
  },
};
