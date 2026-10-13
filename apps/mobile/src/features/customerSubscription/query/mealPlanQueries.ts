import {useMemo} from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  createPrivateQueryKey,
  createPublicQueryKey,
} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {useCustomerOrderDetailQuery} from '../../customerOrders/query/customerOrdersQueries';
import {
  dishDetailApi,
  isCustomerDishMenuItemId,
  type CustomerDishDetail,
} from '../../dishDetail/api/dishDetailApi';
import {createCustomerDishDetailQueryKey} from '../../dishDetail/query/dishDetailQueries';
import {publicKitchenReviewApi} from '../../kitchenProfile/api/publicKitchenReviewApi';
import {
  summarizeSchedule,
  type PlanScheduleSummary,
} from '../../mealPlans/domain/mealPlanSchedule';
import {resolveApiImageUrl} from '../../mealPlans/domain/resolveApiImageUrl';
import {customerSubscriptionApi} from '../api/customerSubscriptionApi';
import {subscriptionPaymentApi} from '../api/subscriptionPaymentApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const MEAL_PLANS_DOMAIN = 'customer-meal-plans';
const PLAN_STALE_MS = 5 * 60_000;
const SUBSCRIPTION_STALE_MS = 30_000;
const RATING_STALE_MS = 10 * 60_000;

// Same private-scope shape as the other customer domains, so logout and role switches clear it.
export const mealPlanQueryPrefix = [
  'craves',
  'v1',
  'private',
  MEAL_PLANS_DOMAIN,
] as const;

export type MealPlanResource =
  | 'plans'
  | 'nearbyPlans'
  | 'schedule'
  | 'policy'
  | 'subscriptions'
  | 'occurrences'
  | 'payment';

export function createMealPlanQueryKey(
  identityId: string,
  resource: MealPlanResource,
  entityId?: string,
) {
  return createPrivateQueryKey(MEAL_PLANS_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    filters: {resource},
    entityId,
  });
}

export function invalidateMealPlanQueries(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({queryKey: mealPlanQueryPrefix});
}

/**
 * `entityId` undefined = a list resource; null or '' = the entity is not known yet, so stay idle.
 * Signed-out sessions never fetch.
 */
function useMealPlanQuery<T>(
  resource: MealPlanResource,
  entityId: string | null | undefined,
  fetcher: (signal: AbortSignal) => Promise<T>,
  staleTime: number,
) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey =
    identityId !== null && (entityId === undefined || Boolean(entityId))
      ? createMealPlanQueryKey(identityId, resource, entityId ?? undefined)
      : null;

  return useQuery({
    queryKey: queryKey ?? ([...mealPlanQueryPrefix, 'disabled', resource] as const),
    queryFn: ({signal}) => fetcher(signal),
    enabled: queryKey !== null,
    staleTime,
  });
}

export function usePublicMealPlansQuery() {
  return useMealPlanQuery(
    'plans',
    undefined,
    signal => customerSubscriptionApi.listPlans(signal),
    PLAN_STALE_MS,
  );
}

/** Browse list: only chefs within 10 km of the selected location. Other screens look plans up in the full list. */
export function useNearbyMealPlansQuery() {
  const location = useAppSelector(state => state.customerShell.selectedLocation);
  return useMealPlanQuery(
    'nearbyPlans',
    location ? `${location.latitude},${location.longitude}` : null,
    signal => customerSubscriptionApi.listNearbyPlans(location!, signal),
    PLAN_STALE_MS,
  );
}

export function useHasMealPlanLocation(): boolean {
  return useAppSelector(state => state.customerShell.selectedLocation !== null);
}

export function usePlanScheduleQuery(planId: string | null) {
  return useMealPlanQuery(
    'schedule',
    planId,
    signal => customerSubscriptionApi.getPlanSchedule(planId ?? '', signal),
    PLAN_STALE_MS,
  );
}

export function usePlanPolicyQuery(planId: string | null) {
  return useMealPlanQuery(
    'policy',
    planId,
    signal => customerSubscriptionApi.getPlanPolicy(planId ?? '', signal),
    PLAN_STALE_MS,
  );
}

export function useMySubscriptionsQuery() {
  return useMealPlanQuery(
    'subscriptions',
    undefined,
    signal => customerSubscriptionApi.listMine(signal),
    SUBSCRIPTION_STALE_MS,
  );
}

export function useSubscriptionOccurrencesQuery(subscriptionId: string | null) {
  return useMealPlanQuery(
    'occurrences',
    subscriptionId,
    signal => customerSubscriptionApi.listOccurrences(subscriptionId ?? '', signal),
    SUBSCRIPTION_STALE_MS,
  );
}

export function useLatestSubscriptionPaymentQuery(subscriptionId: string | null) {
  return useMealPlanQuery(
    'payment',
    subscriptionId,
    signal =>
      subscriptionPaymentApi.getLatestForSubscription(subscriptionId ?? '', signal),
    SUBSCRIPTION_STALE_MS,
  );
}

/** The existing customer-orders detail query; idle while `orderId` is null. */
export function useOccurrenceOrderQuery(orderId: string | null) {
  return useCustomerOrderDetailQuery(orderId ?? '');
}

export interface PlanCoverDish {
  imageUrl: string | null;
  kitchenName: string | null;
  kitchenId: string | null;
}

export function selectPlanCover(
  detail: CustomerDishDetail | undefined,
): PlanCoverDish {
  if (!detail) {
    return {imageUrl: null, kitchenName: null, kitchenId: null};
  }
  const cover =
    detail.images.find(image => image.primary) ??
    [...detail.images].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return {
    imageUrl: cover?.url ?? null,
    kitchenName:
      detail.kitchen.displayName?.trim() || detail.kitchen.kitchenName,
    kitchenId: detail.kitchen.id,
  };
}

// Reads the dish-detail cache the dish screens use; any failure (404, inactive kitchen) just yields nulls.
function useDishCover(menuItemId: string | null): PlanCoverDish {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const enabled =
    identityId !== null &&
    menuItemId !== null &&
    isCustomerDishMenuItemId(menuItemId);
  const {data} = useQuery({
    queryKey: enabled
      ? createCustomerDishDetailQueryKey(identityId, menuItemId)
      : ([...mealPlanQueryPrefix, 'disabled', 'dish'] as const),
    queryFn: ({signal}) =>
      dishDetailApi.getCustomerDishDetail(menuItemId ?? '', signal),
    enabled,
    retry: false,
  });
  return useMemo(() => selectPlanCover(data), [data]);
}

export function useMenuItemPreview(menuItemId: string | null): {
  imageUrl: string | null;
  kitchenName: string | null;
} {
  const {imageUrl, kitchenName} = useDishCover(menuItemId);
  return {imageUrl, kitchenName};
}

export interface KitchenRating {
  average: number;
  count: number;
}

/**
 * Reuses the public kitchen review summary. Not gated on PUBLIC_KITCHEN_REVIEWS_AVAILABLE: the route
 * is live in production and the meal-plan design shows ratings. No reviews or any failure give null.
 */
export function useKitchenRatingQuery(kitchenId: string | null): KitchenRating | null {
  const {data} = useQuery({
    queryKey: createPublicQueryKey('customer-meal-plan-kitchen-rating', {
      entityId: kitchenId ?? 'none',
    }),
    queryFn: async ({signal}): Promise<KitchenRating | null> => {
      if (kitchenId === null) {
        return null;
      }
      const summary = await publicKitchenReviewApi.getSummary(kitchenId, signal);
      return summary.reviewCount > 0 && summary.overallAverage !== null
        ? {average: summary.overallAverage, count: summary.reviewCount}
        : null;
    },
    enabled: kitchenId !== null,
    staleTime: RATING_STALE_MS,
    retry: false,
  });
  return data ?? null;
}

export function usePlanCover(planId: string | null): {
  imageUrl: string | null;
  kitchenName: string | null;
  summary: PlanScheduleSummary | null;
  rating: KitchenRating | null;
} {
  const plans = usePublicMealPlansQuery();
  const schedule = usePlanScheduleQuery(planId);
  // An empty or failed schedule has no meal meta to show, so it reads as "no summary".
  const summary = useMemo(
    () =>
      schedule.data && schedule.data.items.length > 0
        ? summarizeSchedule(schedule.data.items)
        : null,
    [schedule.data],
  );
  const dish = useDishCover(summary?.coverMenuItemId ?? null);
  const rating = useKitchenRatingQuery(dish.kitchenId);
  const plan = plans.data?.find(candidate => candidate.id === planId);

  return {
    imageUrl: resolveApiImageUrl(plan?.imageUrl) ?? dish.imageUrl,
    kitchenName: dish.kitchenName,
    summary,
    rating,
  };
}

// Lives in features/mealPlans (shared with the chef screens); re-exported for existing importers.
export {resolveApiImageUrl};

export function useSubscriptionActions(subscriptionId: string) {
  const queryClient = useQueryClient();
  const {mutateAsync, isPending} = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    // Also after a failure: a 409 means our copy of the subscription is stale.
    onSettled: () => invalidateMealPlanQueries(queryClient),
  });
  const act = (run: () => Promise<unknown>) =>
    mutateAsync(run).then(() => undefined);

  return {
    pause: () => act(() => customerSubscriptionApi.pause(subscriptionId)),
    resume: (resumeDate: string) =>
      act(() => customerSubscriptionApi.resume(subscriptionId, resumeDate)),
    skip: (serviceDate: string) =>
      act(() => customerSubscriptionApi.skip(subscriptionId, serviceDate)),
    cancel: () => act(() => customerSubscriptionApi.cancel(subscriptionId)),
    pending: isPending,
  };
}
