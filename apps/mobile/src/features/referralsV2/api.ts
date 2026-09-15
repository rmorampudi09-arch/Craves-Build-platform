import type {AxiosInstance} from 'axios';
import {z} from 'zod';
import {cashout, cashoutsPage, qrPath, referralOverview, rewardsPage, uuid} from './model';

export class ReferralMobileError extends Error {
  constructor(readonly status: number, readonly uncertain: boolean) {
    super(uncertain ? 'The outcome is unknown. Reconcile or retry the original request reference; do not create a replacement.' : status === 401 ? 'Sign in again to verify your session.' : status === 403 ? 'This account cannot perform this operation.' : 'The referral request was not accepted. Refresh the account and policy status.');
  }
}
/** Pass the existing authenticated Axios client, including its established refresh interceptor. */
export function createReferralNativeApi(authenticatedClient: AxiosInstance) {
  async function call<T>(path: string, schema: z.ZodType<T>, body?: unknown, signal?: AbortSignal): Promise<T> {
    const write = body !== undefined;
    try {
      const response = await authenticatedClient.request({url: `/api/v1/referrals${path}`, method: write ? 'POST' : 'GET', data: body, signal, timeout: 10000, headers: {Accept: 'application/json', 'Cache-Control': 'no-store'}});
      const result = schema.safeParse(response.status === 204 ? null : response.data);
      if (!result.success) { throw new ReferralMobileError(502, write); }
      return result.data;
    } catch (error) {
      if (error instanceof ReferralMobileError) { throw error; }
      const failure = z.object({status: z.number().optional(), response: z.object({status: z.number()}).optional()}).safeParse(error);
      const status = failure.success ? failure.data.response?.status ?? failure.data.status ?? 0 : 0;
      throw new ReferralMobileError(status, write && (status === 0 || status >= 500));
    }
  }
  const page = (cursor?: string | null) => `?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  return {
    overview: (signal?: AbortSignal) => call('/me', referralOverview, undefined, signal),
    rewards: (cursor?: string | null, signal?: AbortSignal) => call('/me/rewards' + page(cursor), rewardsPage, undefined, signal),
    cashouts: (cursor?: string | null, signal?: AbortSignal) => call('/me/cashouts' + page(cursor), cashoutsPage, undefined, signal),
    withdraw: (requestId: string, amountPaise: string) => call('/me/cashouts', cashout, {requestId: uuid.parse(requestId), amountPaise}),
    cancel: (requestId: string) => call(`/me/cashouts/${uuid.parse(requestId)}/cancel`, z.null(), {}),
    async qr(signal?: AbortSignal): Promise<string> {
      const response = await authenticatedClient.get('/api/v1/referrals/me/code/qr', {signal, responseType: 'text', timeout: 10000, headers: {Accept: 'image/svg+xml', 'Cache-Control': 'no-store'}});
      return qrPath(response.data);
    },
  };
}
export type ReferralNativeApi = ReturnType<typeof createReferralNativeApi>;
