import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';
import {chefDashboardApi} from '../api/chefDashboardApi';
import {
  deriveChefDashboardModel,
  type ChefDashboardModel,
} from '../domain/chefDashboardModel';

const CHEF_ROLE = 'CHEF' as const;

type DashboardSourceStatus = 'pending' | 'error' | 'success';

export interface ChefDashboardSourceStatus {
  orders: DashboardSourceStatus;
  earnings: DashboardSourceStatus;
  menu: DashboardSourceStatus;
  notifications: DashboardSourceStatus;
}

export interface ChefDashboardQueryModel {
  data: ChefDashboardModel;
  sources: ChefDashboardSourceStatus;
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

  const refresh = React.useCallback(async () => {
    await Promise.allSettled([
      operational.refresh(),
      earningsQuery.refetch(),
      menuQuery.refetch(),
    ]);
  }, [earningsQuery, menuQuery, operational]);

  return {
    data,
    sources: {
      orders: operational.ordersStatus,
      earnings: earningsQuery.status,
      menu: menuQuery.status,
      notifications: operational.notificationsStatus,
    },
    isRefreshing:
      operational.isRefreshing ||
      earningsQuery.isFetching ||
      menuQuery.isFetching,
    refresh,
  };
}
