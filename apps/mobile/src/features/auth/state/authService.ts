import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {sessionManager} from '../api/sessionManager';
import {authApi} from '../api/authApi';
import {firebaseAuth} from '../firebase/firebaseAuth';
import {
  mapFirebaseAuthError,
  mapPasswordRecoveryFirebaseError,
} from '../firebase/firebaseAuthError';
import type {AuthRole, AuthTokenResponse} from '../domain/types';

let otpChallenge: {phone: string; challengeId: string} | null = null;

async function sendOtp(digits: string, challengeId?: string): Promise<string> {
  try {
    return await authApi.sendPhoneOtp(digits, challengeId);
  } catch (error) {
    throw toAppApiError(error);
  }
}

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
  async discardRestoredSession(): Promise<void> {
    await clearPartialAuthentication();
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
  /**
   * Phone OTP sent by MSG91 through auth-service's central OTP, the web's flow. A resend to the same phone reuses
   * the challenge; when the server no longer knows it (OTP_RESTART: expired or used) a new one starts.
   */
  async beginMsg91Phone(e164Phone: string): Promise<void> {
    const digits = e164Phone.replace(/^\+91/, '');
    const previous = otpChallenge?.phone === e164Phone ? otpChallenge.challengeId : undefined;
    try {
      otpChallenge = {phone: e164Phone, challengeId: await sendOtp(digits, previous)};
    } catch (error) {
      if (error instanceof AppApiError && error.code === 'OTP_RESEND_LIMIT') {
        otpChallenge = null; // the server's limit stands; the next tap after the wait starts a new challenge
      }
      if (!previous || !(error instanceof AppApiError) || error.code !== 'OTP_RESTART') {
        throw error;
      }
      otpChallenge = null;
      otpChallenge = {phone: e164Phone, challengeId: await sendOtp(digits)};
    }
  },
  async confirmMsg91Otp(code: string): Promise<AuthTokenResponse> {
    const challenge = otpChallenge;
    if (!challenge) {
      throw new AppApiError('OTP_EXPIRED', 'This verification request has expired. Request a new code to continue.');
    }
    let customToken: string;
    try {
      customToken = await authApi.verifyPhoneOtp(challenge.challengeId, code);
    } catch (error) {
      const mapped = toAppApiError(error);
      // A wrong code keeps the challenge for another try; anything else needs a new code.
      if (mapped.code !== 'OTP_INVALID') {
        otpChallenge = null;
      }
      throw mapped;
    }
    otpChallenge = null;
    try {
      return await exchangeAndPersist(await firebaseAuth.signInWithCustomToken(customToken));
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
      await clearPartialAuthentication();
    }
  },
};
