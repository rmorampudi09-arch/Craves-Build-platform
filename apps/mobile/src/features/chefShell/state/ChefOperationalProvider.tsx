import React from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
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
    await Promise.allSettled([ordersQuery.refetch(), notificationsQuery.refetch()]);
  }, [notificationsQuery, ordersQuery]);

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
      notificationsStatus: notificationsQuery.status,
      isRefreshing: ordersQuery.isFetching || notificationsQuery.isFetching,
      markingNoticeId: markReadMutation.isPending ? markReadMutation.variables ?? null : null,
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
      markReadMutation,
      notices,
      notificationsQuery.isFetching,
      notificationsQuery.status,
      orderTabs,
      orders,
      ordersQuery.isFetching,
      ordersQuery.status,
      reconcileOrderStatus,
      refresh,
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
