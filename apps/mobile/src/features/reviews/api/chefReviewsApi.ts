import {httpClient} from '../../../core/http/httpClient';
import {
  parsePublicKitchenReviewPage,
  parsePublicKitchenReviewSummary,
  type PublicKitchenReviewPage,
  type PublicKitchenReviewSummary,
} from './publicKitchenReviewsApi';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Order Service owns the Chef review routes, but main does not publish them through APIM yet.
export const CHEF_REVIEWS_AVAILABLE = false;

function requireUuid(value: string, code: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error(code);
  return value;
}

function normalizeLimit(limit: number | undefined): number {
  const resolved = limit ?? 20;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 50) {
    throw new Error('CHEF_REVIEWS_LIMIT_INVALID');
  }
  return resolved;
}

export const chefReviewsApi = {
  async list(options?: {
    kitchenId?: string | null;
    limit?: number;
    cursor?: string | null;
    signal?: AbortSignal;
  }): Promise<PublicKitchenReviewPage> {
    const limit = normalizeLimit(options?.limit);
    const params: Record<string, string | number> = {limit};

    if (options?.kitchenId) {
      params.kitchenId = requireUuid(
        options.kitchenId,
        'CHEF_REVIEWS_KITCHEN_ID_INVALID',
      );
    }
    if (options?.cursor) params.cursor = options.cursor;

    const value = await httpClient.get<unknown>('/api/v1/chef/reviews', {
      signal: options?.signal,
      params,
      dedupeKey: `chef-reviews:${options?.kitchenId ?? 'all'}:${limit}:${
        options?.cursor ?? ''
      }`,
    });

    const parsed = parsePublicKitchenReviewPage(value);
    if (
      !parsed ||
      (options?.kitchenId &&
        parsed.items.some(review => review.kitchenId !== options.kitchenId))
    ) {
      throw new Error('CHEF_REVIEWS_INVALID_RESPONSE');
    }
    return parsed;
  },

  async summary(
    kitchenId: string,
    signal?: AbortSignal,
  ): Promise<PublicKitchenReviewSummary> {
    const normalizedKitchenId = requireUuid(
      kitchenId,
      'CHEF_REVIEWS_KITCHEN_ID_INVALID',
    );
    const value = await httpClient.get<unknown>(
      `/api/v1/chef/reviews/kitchens/${normalizedKitchenId}/summary`,
      {
        signal,
        dedupeKey: `chef-review-summary:${normalizedKitchenId}`,
      },
    );
    const parsed = parsePublicKitchenReviewSummary(value);
    if (!parsed || parsed.kitchenId !== normalizedKitchenId) {
      throw new Error('CHEF_REVIEW_SUMMARY_INVALID_RESPONSE');
    }
    return parsed;
  },
};
