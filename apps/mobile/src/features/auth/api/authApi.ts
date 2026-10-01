import { httpClient } from '../../../core/http/httpClient';
import { publicApiClient } from '../../../core/http/transport';
import { refreshTokenStore } from '../../../core/security/refreshTokenStore';
import type { AuthTokenResponse, Identity } from '../domain/types';
import { z } from 'zod';
import { AppApiError } from '../../../core/http/apiError';

const widgetConfigSchema = z.object({
  provider: z.literal('msg91'),
  widgetId: z.string().min(1).max(100),
  tokenAuth: z.string().min(1).max(2000),
});
const msg91VerificationSchema = z.object({
  firebaseCustomToken: z.string().min(100).max(20000),
});

const authPath = '/api/v1/auth';

export const authApi = {
  async otpWidgetConfig(): Promise<z.infer<typeof widgetConfigSchema>> {
    // This is the existing public web configuration, not a server authkey.
    const response = await publicApiClient.get<unknown>(
      'https://craves.in/api/auth/otp-config',
      { timeout: 10000, headers: { 'Cache-Control': 'no-cache' } },
    );
    const parsed = widgetConfigSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new AppApiError(
        'OTP_UNAVAILABLE',
        'Phone verification is temporarily unavailable. Please try again shortly.',
      );
    }
    return parsed.data;
  },
  async verifyMsg91Token(accessToken: string): Promise<string> {
    const response = await publicApiClient.post<unknown>(
      `${authPath}/msg91/verify`,
      { accessToken },
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
