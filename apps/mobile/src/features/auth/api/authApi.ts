import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {publicApiClient} from '../../../core/http/transport';
import {refreshTokenStore} from '../../../core/security/refreshTokenStore';
import type {AuthTokenResponse, Identity} from '../domain/types';

const authPath = '/api/v1/auth';
const CHALLENGE_ID = /^[A-Za-z0-9_-]{43}$/;

/** Who asks for a code: the rider app gets its own SMS template, and each install its own OTP limits. */
export interface OtpClient {
  app?: 'rider';
  installationId?: string | null;
}

/** autoRead: the SMS went with the rider template, so the SMS Retriever can read its code with no tap. */
export interface SentOtp {
  challengeId: string;
  autoRead: boolean;
}

function invalidOtpResponse(): AppApiError {
  return new AppApiError('OTP_UNAVAILABLE', 'Sign-in is temporarily unavailable. Try again shortly.');
}

function otpHeaders(client: OtpClient = {}): Record<string, string> {
  return {
    ...(client.app ? {'X-Craves-App': client.app} : {}),
    ...(client.installationId ? {'X-Craves-Installation-Id': client.installationId} : {}),
  };
}

export const authApi = {
  /** The central phone OTP (auth-service sends it by MSG91, as on the web); a resend passes the challenge back. */
  async sendPhoneOtp(phoneNumber: string, challengeId?: string, client?: OtpClient): Promise<SentOtp> {
    const response = await publicApiClient.post<{challengeId?: unknown; autoRead?: unknown}>(
      `${authPath}/otp/send`,
      {phoneNumber, countryCode: '91', ...(challengeId ? {challengeId} : {})},
      {timeout: 15000, headers: otpHeaders(client)},
    );
    const next = response.data?.challengeId;
    if (typeof next !== 'string' || !CHALLENGE_ID.test(next)) {
      throw invalidOtpResponse();
    }
    return {challengeId: next, autoRead: response.data.autoRead === true};
  },
  /** Checks the code; answers a Firebase custom token for the phone's identity. */
  async verifyPhoneOtp(challengeId: string, otp: string, client?: OtpClient): Promise<string> {
    const response = await publicApiClient.post<{firebaseCustomToken?: unknown}>(
      `${authPath}/otp/verify`,
      {challengeId, otp},
      {timeout: 15000, headers: otpHeaders(client)},
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
