import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {chefReviewsApi} from '../api/chefReviewsApi';
import type {
  PublicKitchenReview,
  PublicKitchenReviewSummary,
} from '../api/publicKitchenReviewsApi';

const CHEF_ROLE = 'CHEF' as const;
const PREVIEW_LIMIT = 3;

export interface ChefReviewPreviewModel {
  /** False when the server does not publish the reviews route for the app yet. */
  available: boolean;
  reviews: PublicKitchenReview[];
  summary: PublicKitchenReviewSummary | null;
  isPending: boolean;
  isRefreshing: boolean;
  error: unknown;
  refresh: () => Promise<void>;
}

export function useChefReviewPreview(): ChefReviewPreviewModel {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);

  const listKey = React.useMemo(
    () =>
      identityId
        ? createPrivateQueryKey('chef-review-preview', {
            userId: identityId,
            role: CHEF_ROLE,
            paging: {limit: PREVIEW_LIMIT},
          })
        : (['craves', 'v1', 'private', 'chef-review-preview', 'signed-out'] as const),
    [identityId],
  );

  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: ({signal}) =>
      chefReviewsApi.list({limit: PREVIEW_LIMIT, signal}),
    enabled: identityId !== null,
    staleTime: 30_000,
  });

  const reviews = React.useMemo(
    () => listQuery.data?.items ?? [],
    [listQuery.data?.items],
  );
  const kitchenId = React.useMemo(() => {
    if (reviews.length === 0) return null;
    const ids = new Set(reviews.map(review => review.kitchenId));
    return ids.size === 1 ? reviews[0].kitchenId : null;
  }, [reviews]);

  const summaryKey = React.useMemo(
    () =>
      identityId && kitchenId
        ? createPrivateQueryKey('chef-review-summary', {
            userId: identityId,
            role: CHEF_ROLE,
            entityId: kitchenId,
          })
        : (['craves', 'v1', 'private', 'chef-review-summary', 'unresolved'] as const),
    [identityId, kitchenId],
  );

  const summaryQuery = useQuery({
    queryKey: summaryKey,
    queryFn: ({signal}) => chefReviewsApi.summary(kitchenId as string, signal),
    enabled: identityId !== null && kitchenId !== null,
    staleTime: 30_000,
  });

  const refresh = React.useCallback(async () => {
    if (!identityId) return;

    const listResult = await listQuery.refetch();
    const refreshedReviews = listResult.data?.items ?? [];
    const ids = new Set(refreshedReviews.map(review => review.kitchenId));
    if (refreshedReviews.length > 0 && ids.size === 1) {
      await summaryQuery.refetch();
    }
  }, [identityId, listQuery, summaryQuery]);

  return {
    available: !isRouteNotPublished(listQuery.error),
    reviews,
    summary: summaryQuery.data ?? null,
    isPending:
      listQuery.isPending || (kitchenId !== null && summaryQuery.isPending),
    isRefreshing: listQuery.isFetching || summaryQuery.isFetching,
    error: listQuery.error ?? summaryQuery.error ?? null,
    refresh,
  };
}
