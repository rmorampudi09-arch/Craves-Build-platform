import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {publicApiClient} from '../../../core/http/transport';
import {refreshTokenStore} from '../../../core/security/refreshTokenStore';
import type {AuthTokenResponse, Identity} from '../domain/types';

const authPath = '/api/v1/auth';
const CHALLENGE_ID = /^[A-Za-z0-9_-]{43}$/;

function invalidOtpResponse(): AppApiError {
  return new AppApiError('OTP_UNAVAILABLE', 'Sign-in is temporarily unavailable. Try again shortly.');
}

export const authApi = {
  /** The central phone OTP (auth-service sends it by MSG91, as on the web); a resend passes the challenge back. */
  async sendPhoneOtp(phoneNumber: string, challengeId?: string): Promise<string> {
    const response = await publicApiClient.post<{challengeId?: unknown}>(
      `${authPath}/otp/send`,
      {phoneNumber, countryCode: '91', ...(challengeId ? {challengeId} : {})},
      {timeout: 15000},
    );
    const next = response.data?.challengeId;
    if (typeof next !== 'string' || !CHALLENGE_ID.test(next)) {
      throw invalidOtpResponse();
    }
    return next;
  },
  /** Checks the code; answers a Firebase custom token for the phone's identity. */
  async verifyPhoneOtp(challengeId: string, otp: string): Promise<string> {
    const response = await publicApiClient.post<{firebaseCustomToken?: unknown}>(
      `${authPath}/otp/verify`,
      {challengeId, otp},
      {timeout: 15000},
    );
    const token = response.data?.firebaseCustomToken;
    if (typeof token !== 'string' || token.length < 100 || token.length > 20000) {
      throw invalidOtpResponse();
    }
    return token;
  },
  async exchangeFirebaseToken(firebaseIdToken: string): Promise<AuthTokenResponse> {
    const response = await publicApiClient.post<AuthTokenResponse>(
      `${authPath}/firebase/exchange`,
      {firebaseIdToken},
      {timeout: 10000},
    );
    return response.data;
  },
  async me(): Promise<Identity> {
    const response = await httpClient.get<{identity: Identity}>(`${authPath}/me`);
    return response.identity;
  },
  async logout(): Promise<void> {
    const refreshToken = await refreshTokenStore.get();
    if (!refreshToken) {
      return;
    }
    await publicApiClient.post(
      `${authPath}/logout`,
      {refreshToken},
      {timeout: 8000},
    );
  },
};
