import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';
import {chefPayoutApi, type ChefFinanceBalance} from '../../chefPayout/api/chefPayoutApi';
import {chefDashboardApi, type ChefDashboardMenuItem} from '../api/chefDashboardApi';
import {
  deriveChefDashboardModel,
  type ChefDashboardModel,
} from '../domain/chefDashboardModel';
import {deliveredToday, earnedToday, splitHomeOrders} from '../domain/chefDashboardPresentation';

const CHEF_ROLE = 'CHEF' as const;
const EMPTY_MENU: ChefDashboardMenuItem[] = [];

type DashboardSourceStatus = 'pending' | 'error' | 'success';

export interface ChefDashboardSourceStatus {
  orders: DashboardSourceStatus;
  earnings: DashboardSourceStatus;
  menu: DashboardSourceStatus;
  notifications: DashboardSourceStatus;
  balance: DashboardSourceStatus;
}

export interface ChefDashboardQueryModel {
  data: ChefDashboardModel;
  sources: ChefDashboardSourceStatus;
  /** New orders to answer, oldest first. */
  pendingOrders: ChefOperationalOrder[];
  /** Accepted, preparing and ready orders. */
  kitchenOrders: ChefOperationalOrder[];
  menuItems: ChefDashboardMenuItem[];
  /** Today's numbers: rupees earned (earnings entries) and orders delivered. */
  today: {earned: number; delivered: number};
  /** Null until the balance loads or when it cannot be read. */
  balance: ChefFinanceBalance | null;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
}

export function useChefDashboardModel(): ChefDashboardQueryModel {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const operational = useChefOperationalState();

  const earningsQueryKey = React.useMemo(
    () =>
      identityId
        ? createPrivateQueryKey('chef-dashboard-earnings', {
            userId: identityId,
            role: CHEF_ROLE,
            paging: {limit: 200},
          })
        : (['craves', 'v1', 'private', 'chef-dashboard-earnings', 'signed-out'] as const),
    [identityId],
  );
  const menuQueryKey = React.useMemo(
    () =>
      identityId
        ? createPrivateQueryKey('chef-dashboard-menu', {
            userId: identityId,
            role: CHEF_ROLE,
          })
        : (['craves', 'v1', 'private', 'chef-dashboard-menu', 'signed-out'] as const),
    [identityId],
  );

  const balanceQueryKey = React.useMemo(
    () =>
      identityId
        ? createPrivateQueryKey('chef-dashboard-balance', {
            userId: identityId,
            role: CHEF_ROLE,
          })
        : (['craves', 'v1', 'private', 'chef-dashboard-balance', 'signed-out'] as const),
    [identityId],
  );

  const earningsQuery = useQuery({
    queryKey: earningsQueryKey,
    queryFn: ({signal}) => chefDashboardApi.listEarnings(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
  });
  const menuQuery = useQuery({
    queryKey: menuQueryKey,
    queryFn: ({signal}) => chefDashboardApi.listMenuItems(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
  });
  const balanceQuery = useQuery({
    queryKey: balanceQueryKey,
    queryFn: ({signal}) => chefPayoutApi.getBalance(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
  });

  const data = React.useMemo(
    () =>
      deriveChefDashboardModel({
        orders: operational.orders,
        earnings: earningsQuery.data ?? [],
        menuItems: menuQuery.data ?? [],
        notices: operational.notices,
      }),
    [
      earningsQuery.data,
      menuQuery.data,
      operational.notices,
      operational.orders,
    ],
  );

  const homeOrders = React.useMemo(() => splitHomeOrders(operational.orders), [operational.orders]);
  const today = React.useMemo(() => {
    const now = new Date();
    return {
      earned: earnedToday(earningsQuery.data ?? [], now),
      delivered: deliveredToday(operational.orders, now),
    };
  }, [earningsQuery.data, operational.orders]);

  const refresh = React.useCallback(async () => {
    await Promise.allSettled([
      operational.refresh(),
      earningsQuery.refetch(),
      menuQuery.refetch(),
      balanceQuery.refetch(),
    ]);
  }, [balanceQuery, earningsQuery, menuQuery, operational]);

  return {
    data,
    sources: {
      orders: operational.ordersStatus,
      earnings: earningsQuery.status,
      menu: menuQuery.status,
      notifications: operational.notificationsStatus,
      balance: balanceQuery.status,
    },
    pendingOrders: homeOrders.pending,
    kitchenOrders: homeOrders.inKitchen,
    menuItems: menuQuery.data ?? EMPTY_MENU,
    today,
    balance: balanceQuery.data ?? null,
    isRefreshing:
      operational.isRefreshing ||
      earningsQuery.isFetching ||
      menuQuery.isFetching ||
      balanceQuery.isFetching,
    refresh,
  };
}
