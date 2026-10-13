import {toAppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';

// Manifest marker for the APIM coverage check; screens fall back to Coming soon at runtime.
export const CHEF_REFERRAL_ENROLL_AVAILABLE = false;

/** The terms a chef accepts when joining: docs/referrals/CHEF_REFERRAL_TERMS_V1.md. The server refuses any other version. */
export const CHEF_REFERRAL_TERMS_VERSION = 'craves-chef-referral-terms-v1-2026-10-12';

export const CHEF_REFERRAL_ENROLL_ROUTE = '/api/v1/auth/referrals/enroll' as const;

const NOT_ENROLLED_CODE = 'REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE';
const TERMS_CHANGED_CODE = 'CURRENT_REFERRAL_TERMS_ACCEPTANCE_REQUIRED';

/** QUEUED: the server accepted it and is creating the code. ALREADY_ENROLLED: nothing to do but wait for the code. */
export type ChefReferralEnrollStatus = 'QUEUED' | 'ALREADY_ENROLLED';

/** The referral reads answer this 403 for an account that has not joined the programme yet (or is inactive). */
export function isReferralNotEnrolled(error: unknown): boolean {
  const {status, code} = toAppApiError(error);
  return status === 403 && code === NOT_ENROLLED_CODE;
}

/** The server wants a newer version of the terms than this app knows. */
export function isReferralTermsChanged(error: unknown): boolean {
  const {status, code} = toAppApiError(error);
  return status === 409 && code === TERMS_CHANGED_CODE;
}

export const chefReferralEnrollApi = {
  /** Joins the programme as an existing account: no referrer, so the body carries no attribution token. */
  async enroll(): Promise<ChefReferralEnrollStatus> {
    const response = await httpClient.post<unknown>(CHEF_REFERRAL_ENROLL_ROUTE, {
      termsVersion: CHEF_REFERRAL_TERMS_VERSION,
      termsAccepted: true,
    });
    const raw = response && typeof response === 'object' ? (response as Record<string, unknown>) : null;
    if (raw?.accepted !== true || (raw.status !== 'QUEUED' && raw.status !== 'ALREADY_ENROLLED')) {
      throw new Error('REFERRAL_ENROLL_INVALID_RESPONSE');
    }
    return raw.status;
  },
};
