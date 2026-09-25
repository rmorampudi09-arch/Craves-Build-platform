import {
  PUBLIC_KITCHEN_REVIEWS_AVAILABLE,
  publicKitchenReviewsApi,
  type PublicKitchenReviewSummary,
} from '../../reviews/api/publicKitchenReviewsApi';

export {PUBLIC_KITCHEN_REVIEWS_AVAILABLE};
export type {PublicKitchenReviewSummary};

export const publicKitchenReviewApi = {
  async getSummary(
    kitchenId: string,
    signal?: AbortSignal,
  ): Promise<PublicKitchenReviewSummary> {
    return publicKitchenReviewsApi.summary(kitchenId, signal);
  },
};
