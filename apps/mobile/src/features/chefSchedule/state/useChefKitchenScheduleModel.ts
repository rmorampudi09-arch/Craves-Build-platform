import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  CHEF_KITCHEN_SCHEDULE_AVAILABLE,
  PUBLIC_KITCHEN_AVAILABILITY_AVAILABLE,
  chefKitchenScheduleApi,
  scheduleUpdateFromCurrent,
  type ChefKitchenSchedule,
} from '../api/chefKitchenScheduleApi';

const CHEF_ROLE = 'CHEF' as const;
const DOMAIN = 'chef-kitchen-schedule';

export const chefKitchenScheduleQueryPrefix = [
  'craves',
  'v1',
  'private',
  DOMAIN,
] as const;

export function createChefKitchenScheduleQueryKey(identityId: string) {
  return createPrivateQueryKey(DOMAIN, {
    userId: identityId,
    role: CHEF_ROLE,
  });
}

export function useChefKitchenScheduleModel() {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createChefKitchenScheduleQueryKey(identityId)
    : ([...chefKitchenScheduleQueryPrefix, 'signed-out'] as const);

  const scheduleQuery = useQuery({
    queryKey,
    queryFn: ({signal}) => chefKitchenScheduleApi.get(signal),
    enabled: identityId !== null && CHEF_KITCHEN_SCHEDULE_AVAILABLE,
    staleTime: 30_000,
  });

  const availabilityQuery = useQuery({
    queryKey: [...queryKey, 'availability'],
    queryFn: ({signal}) => {
      if (!scheduleQuery.data) {
        throw new Error('CHEF_KITCHEN_SCHEDULE_REQUIRED');
      }
      return chefKitchenScheduleApi.availability(
        scheduleQuery.data.kitchenId,
        null,
        signal,
      );
    },
    enabled:
      identityId !== null &&
      CHEF_KITCHEN_SCHEDULE_AVAILABLE &&
      PUBLIC_KITCHEN_AVAILABILITY_AVAILABLE &&
      Boolean(scheduleQuery.data),
    staleTime: 15_000,
  });

  const updateMutation = useMutation({
    mutationFn: async (
      changes: Pick<
        ReturnType<typeof scheduleUpdateFromCurrent>,
        'acceptingOrders' | 'pausedUntil' | 'pauseReason'
      >,
    ) => {
      const current = scheduleQuery.data;
      if (!current) {
        throw new Error('CHEF_KITCHEN_SCHEDULE_REQUIRED');
      }
      return chefKitchenScheduleApi.replace(
        scheduleUpdateFromCurrent(current, changes),
      );
    },
    onSuccess: schedule => {
      queryClient.setQueryData<ChefKitchenSchedule>(queryKey, schedule);
      void availabilityQuery.refetch();
    },
  });

  return {
    available: CHEF_KITCHEN_SCHEDULE_AVAILABLE,
    availabilityAvailable: PUBLIC_KITCHEN_AVAILABILITY_AVAILABLE,
    sessionRequired: identityId === null,
    schedule: scheduleQuery.data ?? null,
    availability: availabilityQuery.data ?? null,
    status: scheduleQuery.status,
    error: scheduleQuery.error,
    isRefreshing:
      scheduleQuery.isFetching ||
      availabilityQuery.isFetching ||
      updateMutation.isPending,
    isSaving: updateMutation.isPending,
    refresh: async () => {
      await Promise.allSettled([
        scheduleQuery.refetch(),
        availabilityQuery.refetch(),
      ]);
    },
    setAcceptingOrders: async (acceptingOrders: boolean) => {
      const current = scheduleQuery.data;
      await updateMutation.mutateAsync({
        acceptingOrders,
        pausedUntil: current?.pausedUntil ?? null,
        pauseReason: current?.pauseReason ?? null,
      });
    },
    pauseForOneHour: async () => {
      const current = scheduleQuery.data;
      await updateMutation.mutateAsync({
        acceptingOrders: current?.acceptingOrders ?? true,
        pausedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        pauseReason: 'Paused by chef',
      });
    },
    resumeNow: async () => {
      const current = scheduleQuery.data;
      await updateMutation.mutateAsync({
        acceptingOrders: current?.acceptingOrders ?? true,
        pausedUntil: null,
        pauseReason: null,
      });
    },
  };
}
