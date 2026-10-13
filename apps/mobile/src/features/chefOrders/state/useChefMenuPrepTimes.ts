import {useQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {chefDashboardApi, type ChefDashboardMenuItem} from '../../chefDashboard/api/chefDashboardApi';

const NO_ITEMS: ChefDashboardMenuItem[] = [];

/** The chef's dishes, for the minutes an Accept button promises. Shares Home's menu cache, so it costs no second request. */
export function useChefMenuPrepTimes(): ChefDashboardMenuItem[] {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const query = useQuery({
    queryKey: identityId
      ? createPrivateQueryKey('chef-dashboard-menu', {userId: identityId, role: 'CHEF'})
      : (['craves', 'v1', 'private', 'chef-dashboard-menu', 'signed-out'] as const),
    queryFn: ({signal}) => chefDashboardApi.listMenuItems(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
  });
  return query.data ?? NO_ITEMS;
}
