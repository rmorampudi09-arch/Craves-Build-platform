import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {useChefDashboardModel} from '../../chefDashboard/state/useChefDashboardModel';
import {chefProfileApi} from '../api/chefProfileApi';

const CHEF_ROLE = 'CHEF' as const;

export function useChefProfileModel() {
  const identity = useAppSelector(state => state.auth.identity);
  const accountResolution = useAppSelector(state => state.auth.accountResolution);
  const dashboard = useChefDashboardModel();

  const kitchenQueryKey = React.useMemo(
    () =>
      identity?.id
        ? createPrivateQueryKey('chef-profile-kitchen', {
            userId: identity.id,
            role: CHEF_ROLE,
          })
        : (['craves', 'v1', 'private', 'chef-profile-kitchen', 'signed-out'] as const),
    [identity?.id],
  );

  const kitchenQuery = useQuery({
    queryKey: kitchenQueryKey,
    queryFn: ({signal}) => chefProfileApi.getKitchen(signal),
    enabled: identity?.id !== undefined,
    staleTime: 60_000,
  });

  const refresh = React.useCallback(async () => {
    await Promise.allSettled([kitchenQuery.refetch(), dashboard.refresh()]);
  }, [dashboard, kitchenQuery]);

  return {
    identity,
    accountResolution,
    kitchen: kitchenQuery.data ?? null,
    kitchenStatus: kitchenQuery.status,
    isRefreshing: kitchenQuery.isFetching || dashboard.isRefreshing,
    dashboard,
    refresh,
  };
}
