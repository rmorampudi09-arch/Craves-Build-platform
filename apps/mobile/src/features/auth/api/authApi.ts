import { httpClient } from '../../../core/http/httpClient';
import { publicApiClient } from '../../../core/http/transport';
import { refreshTokenStore } from '../../../core/security/refreshTokenStore';
import type { AuthTokenResponse, Identity } from '../domain/types';
import { z } from 'zod';
import { AppApiError } from '../../../core/http/apiError';

const challengeSchema = z.object({
  challengeId: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.number().int().positive(),
  resendAvailableAt: z.number().int().positive(),
});
const msg91VerificationSchema = z.object({
  firebaseCustomToken: z.string().min(100).max(20000),
});

const authPath = '/api/v1/auth';

export const authApi = {
  async sendPhoneOtp(
    phone: string,
    challengeId?: string,
  ): Promise<z.infer<typeof challengeSchema>> {
    const response = await publicApiClient.post<unknown>(
      `${authPath}/otp/send`,
      {
        phoneNumber: phone.slice(3),
        countryCode: '91',
        ...(challengeId ? { challengeId } : {}),
      },
      { timeout: 15000 },
    );
    const parsed = challengeSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new AppApiError(
        'OTP_UNAVAILABLE',
        'Phone verification is temporarily unavailable. Please try again shortly.',
      );
    }
    return parsed.data;
  },
  async verifyPhoneOtp(challengeId: string, otp: string): Promise<string> {
    const response = await publicApiClient.post<unknown>(
      `${authPath}/otp/verify`,
      { challengeId, otp },
      { timeout: 15000 },
    );
    const parsed = msg91VerificationSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new AppApiError(
        'OTP_RESTART',
        'Sign-in could not be completed. Go back and request a new code.',
      );
    }
    return parsed.data.firebaseCustomToken;
  },
  async exchangeFirebaseToken(
    firebaseIdToken: string,
  ): Promise<AuthTokenResponse> {
    const response = await publicApiClient.post<AuthTokenResponse>(
      `${authPath}/firebase/exchange`,
      { firebaseIdToken },
      { timeout: 10000 },
    );
    return response.data;
  },
  async me(): Promise<Identity> {
    const response = await httpClient.get<{ identity: Identity }>(
      `${authPath}/me`,
    );
    return response.identity;
  },
  async logout(): Promise<void> {
    const refreshToken = await refreshTokenStore.get();
    if (!refreshToken) {
      return;
    }
    await publicApiClient.post(
      `${authPath}/logout`,
      { refreshToken },
      { timeout: 8000 },
    );
  },
};
