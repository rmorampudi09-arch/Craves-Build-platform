import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {AppApiError} from '../../../core/http/apiError';
import {
  chefSubscriptionApi,
  type ChefMealPlan,
  type ChefMealSchedule,
} from '../api/chefSubscriptionApi';

const CHEF_ROLE = 'CHEF' as const;
const CHEF_MEAL_PLANS_DOMAIN = 'chef-meal-plans';
const STALE_MS = 30_000;

// Same private-scope shape as the other chef domains, so logout and role switches clear it.
export const chefMealPlansQueryPrefix = [
  'craves',
  'v1',
  'private',
  CHEF_MEAL_PLANS_DOMAIN,
] as const;

export function createChefMealPlanQueryKey(
  identityId: string,
  resource: 'plans' | 'schedule' | 'capacity',
  entityId?: string,
) {
  return createPrivateQueryKey(CHEF_MEAL_PLANS_DOMAIN, {
    userId: identityId,
    role: CHEF_ROLE,
    filters: {resource},
    entityId,
  });
}

export function invalidateChefMealPlans(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({queryKey: chefMealPlansQueryPrefix});
}

function useIdentityId() {
  return useAppSelector(state => state.auth.identity?.id ?? null);
}

export function useChefMealPlansQuery() {
  const identityId = useIdentityId();
  return useQuery({
    queryKey: identityId
      ? createChefMealPlanQueryKey(identityId, 'plans')
      : ([...chefMealPlansQueryPrefix, 'signed-out'] as const),
    queryFn: ({signal}) => chefSubscriptionApi.listPlans(signal),
    enabled: identityId !== null,
    staleTime: STALE_MS,
  });
}

const isNotFound = (error: unknown) => error instanceof AppApiError && error.status === 404;

/**
 * Schedules by plan id with the state of loading them. A plan without meals yet answers 404: that is an empty
 * schedule (absent from `byId`), not a failure. `failed` is any other error, `isLoading` the first fetch.
 */
export function useChefMealPlanSchedulesState(planIds: string[]) {
  const identityId = useIdentityId();
  return useQueries({
    queries: planIds.map(planId => ({
      queryKey: identityId
        ? createChefMealPlanQueryKey(identityId, 'schedule', planId)
        : ([...chefMealPlansQueryPrefix, 'signed-out', planId] as const),
      queryFn: ({signal}: {signal: AbortSignal}) =>
        chefSubscriptionApi.getSchedule(planId, signal),
      enabled: identityId !== null,
      staleTime: STALE_MS,
      retry: false,
    })),
    combine: results => ({
      byId: Object.fromEntries(planIds.map((planId, index) => [planId, results[index]?.data])) as Record<
        string,
        ChefMealSchedule | undefined
      >,
      isLoading: results.some(result => result.isLoading),
      failed: results.some(result => result.isError && !isNotFound(result.error)),
      refetch: () => results.forEach(result => result.refetch()),
    }),
  });
}

/** Loaded schedules by plan id; a plan whose schedule is loading or failed is simply absent. */
export function useChefMealPlanSchedulesQuery(
  planIds: string[],
): Record<string, ChefMealSchedule | undefined> {
  return useChefMealPlanSchedulesState(planIds).byId;
}

/** One plan's schedule with its error, for the editor (a 404 means the draft has no schedule yet). */
export function useChefMealPlanScheduleQuery(planId: string | undefined) {
  const identityId = useIdentityId();
  return useQuery({
    queryKey:
      identityId && planId
        ? createChefMealPlanQueryKey(identityId, 'schedule', planId)
        : ([...chefMealPlansQueryPrefix, 'signed-out', planId ?? 'new'] as const),
    queryFn: ({signal}) => chefSubscriptionApi.getSchedule(planId as string, signal),
    enabled: identityId !== null && planId !== undefined,
    staleTime: STALE_MS,
    retry: false,
  });
}

/** The chef's daily limits; the error is kept so the screen can tell a route the server has not published from a failure. */
export function useChefCapacityQuery() {
  const identityId = useIdentityId();
  return useQuery({
    queryKey: identityId
      ? createChefMealPlanQueryKey(identityId, 'capacity')
      : ([...chefMealPlansQueryPrefix, 'signed-out', 'capacity'] as const),
    queryFn: ({signal}) => chefSubscriptionApi.getCapacity(signal),
    enabled: identityId !== null,
    staleTime: STALE_MS,
    retry: false,
  });
}

/** Optimistic-free: callers keep their own pending value and revert it when the promise rejects. */
export function useSetAcceptingSubscribers() {
  const identityId = useIdentityId();
  const queryClient = useQueryClient();
  const {mutateAsync} = useMutation({
    mutationFn: ({planId, accepting}: {planId: string; accepting: boolean}) =>
      chefSubscriptionApi.setAcceptingSubscribers(planId, accepting),
    onSuccess: updated => {
      if (identityId) {
        queryClient.setQueryData<ChefMealPlan[]>(
          createChefMealPlanQueryKey(identityId, 'plans'),
          current => current?.map(plan => (plan.id === updated.id ? updated : plan)),
        );
      }
    },
    // Also after a failure (a 409 means our copy is stale); not awaited so an error shows without waiting for the refetch.
    onSettled: () => {
      if (identityId) {
        queryClient
          .invalidateQueries({queryKey: createChefMealPlanQueryKey(identityId, 'plans')})
          .catch(() => undefined);
      }
    },
  });
  return (planId: string, accepting: boolean) => mutateAsync({planId, accepting});
}
