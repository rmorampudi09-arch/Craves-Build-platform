import React from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  chefOperationalApi,
  type ChefOperationalNotice,
} from '../api/chefOperationalApi';
import {
  deriveChefOperationalCounters,
  type ChefOperationalCounters,
} from '../domain/chefOperationalCounters';

const CHEF_ROLE = 'CHEF' as const;
const EMPTY_COUNTERS: ChefOperationalCounters = {
  pendingAcceptance: 0,
  activeOrders: 0,
  readyForPickup: 0,
  unreadNotifications: 0,
};

interface ChefOperationalContextValue {
  counters: ChefOperationalCounters;
  notices: ChefOperationalNotice[];
  ordersStatus: 'pending' | 'error' | 'success';
  notificationsStatus: 'pending' | 'error' | 'success';
  isRefreshing: boolean;
  markingNoticeId: string | null;
  refresh: () => Promise<void>;
  markNotificationRead: (noticeId: string) => void;
}

const ChefOperationalContext = React.createContext<ChefOperationalContextValue | null>(null);

export function ChefOperationalProvider({children}: React.PropsWithChildren) {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const ordersQueryKey = React.useMemo(
    () =>
      identityId
        ? createPrivateQueryKey('chef-operational-orders', {
            userId: identityId,
            role: CHEF_ROLE,
          })
        : (['craves', 'v1', 'private', 'chef-operational-orders', 'signed-out'] as const),
    [identityId],
  );
  const notificationsQueryKey = React.useMemo(
    () =>
      identityId
        ? createPrivateQueryKey('chef-notifications', {
            userId: identityId,
            role: CHEF_ROLE,
            paging: {limit: 100},
          })
        : (['craves', 'v1', 'private', 'chef-notifications', 'signed-out'] as const),
    [identityId],
  );

  const ordersQuery = useQuery({
    queryKey: ordersQueryKey,
    queryFn: ({signal}) => chefOperationalApi.listOrders(signal),
    enabled: identityId !== null,
    staleTime: 15_000,
  });
  const notificationsQuery = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: ({signal}) => chefOperationalApi.listNotifications(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (noticeId: string) => chefOperationalApi.markNotificationRead(noticeId),
    onSuccess: (_data, noticeId) => {
      queryClient.setQueryData<ChefOperationalNotice[]>(
        notificationsQueryKey,
        current =>
          (current ?? []).map(notice =>
            notice.id === noticeId && notice.readAt === null
              ? {...notice, readAt: new Date().toISOString()}
              : notice,
          ),
      );
    },
  });

  const orders = React.useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const notices = React.useMemo(
    () => notificationsQuery.data ?? [],
    [notificationsQuery.data],
  );
  const counters = React.useMemo(
    () => deriveChefOperationalCounters(orders, notices),
    [orders, notices],
  );

  const refresh = React.useCallback(async () => {
    await Promise.allSettled([ordersQuery.refetch(), notificationsQuery.refetch()]);
  }, [notificationsQuery, ordersQuery]);

  const value = React.useMemo<ChefOperationalContextValue>(
    () => ({
      counters: identityId ? counters : EMPTY_COUNTERS,
      notices,
      ordersStatus: ordersQuery.status,
      notificationsStatus: notificationsQuery.status,
      isRefreshing: ordersQuery.isFetching || notificationsQuery.isFetching,
      markingNoticeId: markReadMutation.isPending ? markReadMutation.variables ?? null : null,
      refresh,
      markNotificationRead: noticeId => {
        if (!markReadMutation.isPending) {
          markReadMutation.mutate(noticeId);
        }
      },
    }),
    [
      counters,
      identityId,
      markReadMutation,
      notices,
      notificationsQuery.isFetching,
      notificationsQuery.status,
      ordersQuery.isFetching,
      ordersQuery.status,
      refresh,
    ],
  );

  return (
    <ChefOperationalContext.Provider value={value}>
      {children}
    </ChefOperationalContext.Provider>
  );
}

export function useChefOperationalState(): ChefOperationalContextValue {
  const value = React.useContext(ChefOperationalContext);
  if (!value) {
    throw new Error('useChefOperationalState must be used inside ChefOperationalProvider.');
  }
  return value;
}
