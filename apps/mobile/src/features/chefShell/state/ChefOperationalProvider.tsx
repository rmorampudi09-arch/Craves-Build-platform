import React from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  CHEF_NOTIFICATION_INBOX_V2_AVAILABLE,
  CHEF_NOTIFICATION_PAGE_SIZE,
  chefNotificationInboxApi,
} from '../api/chefNotificationInboxApi';
import {
  chefOperationalApi,
  type ChefOperationalNotice,
  type ChefOperationalOrder,
  type ChefOperationalOrderStatus,
} from '../api/chefOperationalApi';
import {
  deriveChefOperationalCounters,
  type ChefOperationalCounters,
} from '../domain/chefOperationalCounters';
import {
  CHEF_ORDER_TABS,
  createChefOrderTabQueryKey,
  createInitialChefOrderTabUiState,
  deriveChefOrderTabCounts,
  deriveChefOrderTabPage,
  deriveChefPrepTimers,
  selectChefOrderTab,
  updateChefOrderTabPage,
  updateChefOrderTabScroll,
  type ChefOrderTab,
  type ChefOrderTabCounts,
  type ChefOrderTabPage,
  type ChefOrderTabPageState,
  type ChefOrderTabScrollState,
  type ChefPrepTimer,
} from '../../chefOrders/domain/chefOrderTabs';
import {
  getChefOrderNearRealtimeIntervalMs,
  reconcileChefOperationalOrderSnapshots,
} from '../../chefOrders/domain/chefOrderEventReconciliation';

const CHEF_ROLE = 'CHEF' as const;
const EMPTY_COUNTERS: ChefOperationalCounters = {
  pendingAcceptance: 0,
  activeOrders: 0,
  readyForPickup: 0,
  unreadNotifications: 0,
};

export interface ChefOrderTabsOperationalState {
  selectedStatus: ChefOrderTab;
  ordersPage: ChefOrderTabPageState;
  tabCounts: ChefOrderTabCounts;
  prepTimers: Record<string, ChefPrepTimer>;
  scrollState: ChefOrderTabScrollState;
  pages: Record<ChefOrderTab, ChefOrderTabPage>;
  queryKeys: Record<ChefOrderTab, readonly unknown[]>;
  selectStatus: (status: ChefOrderTab) => void;
  setPage: (status: ChefOrderTab, page: number) => void;
  setScrollOffset: (status: ChefOrderTab, offset: number) => void;
}

interface ChefOperationalContextValue {
  counters: ChefOperationalCounters;
  orders: ChefOperationalOrder[];
  notices: ChefOperationalNotice[];
  orderTabs: ChefOrderTabsOperationalState;
  ordersStatus: 'pending' | 'error' | 'success';
  notificationsStatus: 'pending' | 'error' | 'success';
  isRefreshing: boolean;
  markingNoticeId: string | null;
  markingAllNotificationsRead: boolean;
  notificationV2Available: boolean;
  notificationsHasNextPage: boolean;
  isFetchingNextNotificationsPage: boolean;
  fetchNextNotifications: () => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  refresh: () => Promise<void>;
  reconcileOrderStatus: (
    orderId: string,
    status: ChefOperationalOrderStatus,
    updatedAt?: string | null,
    prepTimeMinutes?: number | null,
  ) => void;
  markNotificationRead: (noticeId: string) => void;
}

const ChefOperationalContext = React.createContext<ChefOperationalContextValue | null>(null);

export function ChefOperationalProvider({children}: React.PropsWithChildren) {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const [tabUiState, setTabUiState] = React.useState(createInitialChefOrderTabUiState);
  const [clockSampleMs, setClockSampleMs] = React.useState(() => Date.now());
  const [appState, setAppState] = React.useState<AppStateStatus>(AppState.currentState);
  const previousAppStateRef = React.useRef<AppStateStatus>(AppState.currentState);

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
  const notificationsV2QueryKey = React.useMemo(
    () =>
      identityId
        ? createPrivateQueryKey('chef-notifications-v2', {
            userId: identityId,
            role: CHEF_ROLE,
            paging: {limit: CHEF_NOTIFICATION_PAGE_SIZE},
          })
        : ([
            'craves',
            'v1',
            'private',
            'chef-notifications-v2',
            'signed-out',
          ] as const),
    [identityId],
  );
  const notificationCountQueryKey = React.useMemo(
    () =>
      identityId
        ? createPrivateQueryKey('chef-notification-unread-count', {
            userId: identityId,
            role: CHEF_ROLE,
          })
        : ([
            'craves',
            'v1',
            'private',
            'chef-notification-unread-count',
            'signed-out',
          ] as const),
    [identityId],
  );

  const ordersQuery = useQuery({
    queryKey: ordersQueryKey,
    queryFn: async ({signal}) => {
      const incoming = await chefOperationalApi.listOrders(signal);
      const current =
        queryClient.getQueryData<ChefOperationalOrder[]>(ordersQueryKey) ?? [];
      return reconcileChefOperationalOrderSnapshots(current, incoming);
    },
    enabled: identityId !== null,
    staleTime: 15_000,
    refetchInterval: query =>
      getChefOrderNearRealtimeIntervalMs({
        hasIdentity: identityId !== null,
        isAppActive: appState === 'active',
        failureCount: query.state.fetchFailureCount,
      }),
    refetchIntervalInBackground: false,
  });
  const legacyNotificationsQuery = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: ({signal}) => chefOperationalApi.listNotifications(signal),
    enabled:
      identityId !== null && !CHEF_NOTIFICATION_INBOX_V2_AVAILABLE,
    staleTime: 30_000,
  });
  const v2NotificationsQuery = useInfiniteQuery({
    queryKey: notificationsV2QueryKey,
    queryFn: ({pageParam, signal}) =>
      chefNotificationInboxApi.page({
        limit: CHEF_NOTIFICATION_PAGE_SIZE,
        cursor: pageParam,
        unreadOnly: false,
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
    enabled:
      identityId !== null && CHEF_NOTIFICATION_INBOX_V2_AVAILABLE,
    staleTime: 30_000,
  });
  const notificationCountQuery = useQuery({
    queryKey: notificationCountQueryKey,
    queryFn: ({signal}) => chefNotificationInboxApi.unreadCount(signal),
    enabled:
      identityId !== null && CHEF_NOTIFICATION_INBOX_V2_AVAILABLE,
    staleTime: 15_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (noticeId: string) =>
      CHEF_NOTIFICATION_INBOX_V2_AVAILABLE
        ? chefNotificationInboxApi.markRead(noticeId)
        : chefOperationalApi.markNotificationRead(noticeId),
    onSuccess: (_data, noticeId) => {
      if (CHEF_NOTIFICATION_INBOX_V2_AVAILABLE) {
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: notificationsV2QueryKey,
            exact: true,
          }),
          queryClient.invalidateQueries({
            queryKey: notificationCountQueryKey,
            exact: true,
          }),
        ]);
        return;
      }

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

  const markAllReadMutation = useMutation({
    mutationFn: () => {
      if (!CHEF_NOTIFICATION_INBOX_V2_AVAILABLE) {
        throw new Error('CHEF_NOTIFICATION_INBOX_V2_UNAVAILABLE');
      }
      return chefNotificationInboxApi.markAllRead();
    },
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: notificationsV2QueryKey,
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: notificationCountQueryKey,
          exact: true,
        }),
      ]);
    },
  });

  const orders = React.useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const notices = React.useMemo(
    () =>
      CHEF_NOTIFICATION_INBOX_V2_AVAILABLE
        ? v2NotificationsQuery.data?.pages.flatMap(page => page.notices) ?? []
        : legacyNotificationsQuery.data ?? [],
    [legacyNotificationsQuery.data, v2NotificationsQuery.data],
  );
  const counters = React.useMemo(() => {
    const base = deriveChefOperationalCounters(orders, notices);
    return CHEF_NOTIFICATION_INBOX_V2_AVAILABLE
      ? {
          ...base,
          unreadNotifications:
            notificationCountQuery.data?.unreadCount ?? 0,
        }
      : base;
  }, [notificationCountQuery.data?.unreadCount, notices, orders]);
  const tabCounts = React.useMemo(() => deriveChefOrderTabCounts(orders), [orders]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      const previousAppState = previousAppStateRef.current;
      previousAppStateRef.current = nextAppState;
      setAppState(nextAppState);

      if (identityId === null) {
        return;
      }

      if (nextAppState === 'active' && previousAppState !== 'active') {
        void queryClient.invalidateQueries({
          queryKey: ordersQueryKey,
          exact: true,
          refetchType: 'active',
        });
        return;
      }

      if (nextAppState !== 'active' && previousAppState === 'active') {
        void queryClient.cancelQueries({queryKey: ordersQueryKey, exact: true});
      }
    });

    return () => subscription.remove();
  }, [identityId, ordersQueryKey, queryClient]);

  React.useEffect(() => {
    if (!identityId || tabCounts.PREPARING === 0) {
      return undefined;
    }
    setClockSampleMs(Date.now());
    const timerId = setInterval(() => setClockSampleMs(Date.now()), 15_000);
    return () => clearInterval(timerId);
  }, [identityId, tabCounts.PREPARING]);

  const pages = React.useMemo<Record<ChefOrderTab, ChefOrderTabPage>>(
    () => ({
      NEW: deriveChefOrderTabPage(orders, 'NEW', tabUiState.ordersPage.NEW),
      PREPARING: deriveChefOrderTabPage(orders, 'PREPARING', tabUiState.ordersPage.PREPARING),
      READY: deriveChefOrderTabPage(orders, 'READY', tabUiState.ordersPage.READY),
      COMPLETED: deriveChefOrderTabPage(orders, 'COMPLETED', tabUiState.ordersPage.COMPLETED),
    }),
    [orders, tabUiState.ordersPage],
  );

  const queryKeys = React.useMemo<Record<ChefOrderTab, readonly unknown[]>>(() => {
    const fallback = (status: ChefOrderTab) =>
      ['craves', 'v1', 'private', 'chef-order-tab', status, 'signed-out'] as const;
    return {
      NEW: identityId
        ? createChefOrderTabQueryKey(identityId, 'NEW', pages.NEW.page, pages.NEW.pageSize)
        : fallback('NEW'),
      PREPARING: identityId
        ? createChefOrderTabQueryKey(identityId, 'PREPARING', pages.PREPARING.page, pages.PREPARING.pageSize)
        : fallback('PREPARING'),
      READY: identityId
        ? createChefOrderTabQueryKey(identityId, 'READY', pages.READY.page, pages.READY.pageSize)
        : fallback('READY'),
      COMPLETED: identityId
        ? createChefOrderTabQueryKey(identityId, 'COMPLETED', pages.COMPLETED.page, pages.COMPLETED.pageSize)
        : fallback('COMPLETED'),
    };
  }, [identityId, pages]);

  const prepTimers = React.useMemo(
    () => deriveChefPrepTimers(orders, clockSampleMs),
    [clockSampleMs, orders],
  );

  const refresh = React.useCallback(async () => {
    const notificationRefreshes = CHEF_NOTIFICATION_INBOX_V2_AVAILABLE
      ? [v2NotificationsQuery.refetch(), notificationCountQuery.refetch()]
      : [legacyNotificationsQuery.refetch()];
    await Promise.allSettled([ordersQuery.refetch(), ...notificationRefreshes]);
  }, [
    legacyNotificationsQuery,
    notificationCountQuery,
    ordersQuery,
    v2NotificationsQuery,
  ]);

  const reconcileOrderStatus = React.useCallback(
    (
      orderId: string,
      status: ChefOperationalOrderStatus,
      updatedAt?: string | null,
      prepTimeMinutes?: number | null,
    ) => {
      queryClient.setQueryData<ChefOperationalOrder[]>(ordersQueryKey, current =>
        current?.map(order =>
          order.id === orderId
            ? {
                ...order,
                status,
                ...(updatedAt !== undefined ? {updatedAt} : {}),
                ...(prepTimeMinutes !== undefined ? {prepTimeMinutes} : {}),
              }
            : order,
        ),
      );
    },
    [ordersQueryKey, queryClient],
  );

  const selectStatus = React.useCallback((status: ChefOrderTab) => {
    setTabUiState(current => selectChefOrderTab(current, status));
  }, []);

  const setPage = React.useCallback((status: ChefOrderTab, page: number) => {
    setTabUiState(current => updateChefOrderTabPage(current, status, page));
  }, []);

  const setScrollOffset = React.useCallback((status: ChefOrderTab, offset: number) => {
    setTabUiState(current => updateChefOrderTabScroll(current, status, offset));
  }, []);

  const orderTabs = React.useMemo<ChefOrderTabsOperationalState>(
    () => ({
      selectedStatus: tabUiState.selectedStatus,
      ordersPage: tabUiState.ordersPage,
      tabCounts,
      prepTimers,
      scrollState: tabUiState.scrollState,
      pages,
      queryKeys,
      selectStatus,
      setPage,
      setScrollOffset,
    }),
    [
      pages,
      prepTimers,
      queryKeys,
      selectStatus,
      setPage,
      setScrollOffset,
      tabCounts,
      tabUiState,
    ],
  );

  const value = React.useMemo<ChefOperationalContextValue>(
    () => ({
      counters: identityId ? counters : EMPTY_COUNTERS,
      orders: identityId ? orders : [],
      notices,
      orderTabs,
      ordersStatus: ordersQuery.status,
      notificationsStatus: CHEF_NOTIFICATION_INBOX_V2_AVAILABLE
        ? v2NotificationsQuery.isError || notificationCountQuery.isError
          ? 'error'
          : v2NotificationsQuery.isPending || notificationCountQuery.isPending
            ? 'pending'
            : 'success'
        : legacyNotificationsQuery.status,
      isRefreshing:
        ordersQuery.isFetching ||
        (CHEF_NOTIFICATION_INBOX_V2_AVAILABLE
          ? v2NotificationsQuery.isFetching || notificationCountQuery.isFetching
          : legacyNotificationsQuery.isFetching),
      markingNoticeId: markReadMutation.isPending
        ? markReadMutation.variables ?? null
        : null,
      markingAllNotificationsRead: markAllReadMutation.isPending,
      notificationV2Available: CHEF_NOTIFICATION_INBOX_V2_AVAILABLE,
      notificationsHasNextPage: CHEF_NOTIFICATION_INBOX_V2_AVAILABLE
        ? Boolean(v2NotificationsQuery.hasNextPage)
        : false,
      isFetchingNextNotificationsPage: CHEF_NOTIFICATION_INBOX_V2_AVAILABLE
        ? v2NotificationsQuery.isFetchingNextPage
        : false,
      fetchNextNotifications: () =>
        CHEF_NOTIFICATION_INBOX_V2_AVAILABLE
          ? v2NotificationsQuery.fetchNextPage().then(() => undefined)
          : Promise.resolve(),
      markAllNotificationsRead: () =>
        markAllReadMutation.mutateAsync().then(() => undefined),
      refresh,
      reconcileOrderStatus,
      markNotificationRead: noticeId => {
        if (!markReadMutation.isPending) {
          markReadMutation.mutate(noticeId);
        }
      },
    }),
    [
      counters,
      identityId,
      legacyNotificationsQuery.isFetching,
      legacyNotificationsQuery.status,
      markAllReadMutation,
      markReadMutation,
      notices,
      notificationCountQuery.isError,
      notificationCountQuery.isFetching,
      notificationCountQuery.isPending,
      orderTabs,
      orders,
      ordersQuery.isFetching,
      ordersQuery.status,
      reconcileOrderStatus,
      refresh,
      v2NotificationsQuery.hasNextPage,
      v2NotificationsQuery.isError,
      v2NotificationsQuery.isFetching,
      v2NotificationsQuery.isFetchingNextPage,
      v2NotificationsQuery.isPending,
      v2NotificationsQuery,
    ],
  );

  React.useEffect(() => {
    if (identityId === null) {
      setTabUiState(createInitialChefOrderTabUiState());
    }
  }, [identityId]);

  React.useEffect(() => {
    for (const tab of CHEF_ORDER_TABS) {
      const effectivePage = pages[tab].page;
      if (tabUiState.ordersPage[tab] !== effectivePage) {
        setTabUiState(current => updateChefOrderTabPage(current, tab, effectivePage));
        break;
      }
    }
  }, [pages, tabUiState.ordersPage]);

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
