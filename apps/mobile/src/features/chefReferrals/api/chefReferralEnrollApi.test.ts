import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {
  CHEF_REFERRAL_TERMS_VERSION,
  chefReferralEnrollApi,
  isReferralNotEnrolled,
  isReferralTermsChanged,
} from './chefReferralEnrollApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {post: jest.fn()},
}));

const post = jest.mocked(httpClient.post);

describe('chefReferralEnrollApi.enroll', () => {
  beforeEach(() => jest.clearAllMocks());

  it('posts the current terms version and the acceptance, with no referrer', async () => {
    post.mockResolvedValue({accepted: true, status: 'QUEUED', userId: 'u-1'});
    await chefReferralEnrollApi.enroll();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/v1/auth/referrals/enroll', {
      termsVersion: 'craves-chef-referral-terms-v1-2026-10-12',
      termsAccepted: true,
    });
    expect(CHEF_REFERRAL_TERMS_VERSION).toBe('craves-chef-referral-terms-v1-2026-10-12');
    expect(Object.keys(post.mock.calls[0][1] as object)).not.toContain('attributionToken');
  });

  it.each(['QUEUED', 'ALREADY_ENROLLED'] as const)('returns the %s answer', async status => {
    post.mockResolvedValue({accepted: true, status, userId: 'u-1'});
    await expect(chefReferralEnrollApi.enroll()).resolves.toBe(status);
  });

  it.each([
    ['not accepted', {accepted: false, status: 'QUEUED'}],
    ['an unknown status', {accepted: true, status: 'SOMETHING_ELSE'}],
    ['a missing status', {accepted: true}],
    ['an empty body', ''],
    ['null', null],
  ])('rejects %s instead of treating it as joined', async (_name, body) => {
    post.mockResolvedValue(body);
    await expect(chefReferralEnrollApi.enroll()).rejects.toThrow('REFERRAL_ENROLL_INVALID_RESPONSE');
  });

  it('passes a server refusal through unchanged', async () => {
    const refusal = new AppApiError('CURRENT_REFERRAL_TERMS_ACCEPTANCE_REQUIRED', 'Accept the current referral terms', 409);
    post.mockRejectedValue(refusal);
    await expect(chefReferralEnrollApi.enroll()).rejects.toBe(refusal);
  });
});

describe('referral refusal helpers', () => {
  it('names the 409 terms-changed answer', () => {
    expect(isReferralTermsChanged(new AppApiError('CURRENT_REFERRAL_TERMS_ACCEPTANCE_REQUIRED', 'x', 409))).toBe(true);
    expect(isReferralTermsChanged(new AppApiError('HTTP_409', 'x', 409))).toBe(false);
    expect(isReferralTermsChanged(new AppApiError('ACCOUNT_INACTIVE', 'x', 401))).toBe(false);
    expect(isReferralTermsChanged(new Error('boom'))).toBe(false);
  });

  it('names only the not-enrolled 403, not a gateway 403 with no body', () => {
    expect(isReferralNotEnrolled(new AppApiError('REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE', 'x', 403))).toBe(true);
    expect(isReferralNotEnrolled(new AppApiError('HTTP_403', 'x', 403))).toBe(false);
    expect(isReferralNotEnrolled(new AppApiError('REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE', 'x', 500))).toBe(false);
    expect(isReferralNotEnrolled(undefined)).toBe(false);
  });
});
