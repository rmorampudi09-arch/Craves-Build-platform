import {useQuery, type QueryClient} from '@tanstack/react-query';
import {
  createPrivateQueryKey,
  matchesPrivateQueryScope,
} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {customerHomeFeedQueryPrefix} from '../../home/query/homeFeedQueries';
import {
  dishDetailApi,
  isCustomerDishMenuItemId,
} from '../api/dishDetailApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const CUSTOMER_DISH_DETAIL_DOMAIN = 'customer-dish-detail';

export const customerDishDetailQueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_DISH_DETAIL_DOMAIN,
] as const;

export function createCustomerDishDetailQueryKey(
  identityId: string,
  menuItemId: string,
) {
  if (!isCustomerDishMenuItemId(menuItemId)) {
    throw new Error('menuItemId must be a valid UUID.');
  }

  return createPrivateQueryKey(CUSTOMER_DISH_DETAIL_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    entityId: menuItemId.trim(),
  });
}

function hasPrefix(
  queryKey: readonly unknown[],
  prefix: readonly unknown[],
): boolean {
  return prefix.every((value, index) => queryKey[index] === value);
}

function isCustomerHomeQueryForIdentity(
  queryKey: readonly unknown[],
  identityId: string,
): boolean {
  return (
    hasPrefix(queryKey, customerHomeFeedQueryPrefix) &&
    matchesPrivateQueryScope(queryKey, {
      userId: identityId,
      role: CUSTOMER_ROLE,
    })
  );
}

/**
 * Cache boundary for the eventual authoritative favorite mutation.
 * P39 deliberately does not define or call a favorite endpoint because none exists in the
 * accepted current-branch contract. When that mutation becomes available, success must route
 * through this helper (or an equivalent update) so detail and existing dish-list caches cannot
 * disagree about customer favorite state.
 */
export async function invalidateCustomerDishFavoriteCaches(
  queryClient: QueryClient,
  identityId: string,
  menuItemId: string,
): Promise<void> {
  const detailKey = createCustomerDishDetailQueryKey(identityId, menuItemId);

  await Promise.all([
    queryClient.invalidateQueries({queryKey: detailKey, exact: true}),
    queryClient.invalidateQueries({
      predicate: query =>
        isCustomerHomeQueryForIdentity(query.queryKey, identityId),
    }),
  ]);
}

export function useCustomerDishDetailQuery(menuItemId: string) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const validMenuItemId = isCustomerDishMenuItemId(menuItemId);
  const queryKey =
    identityId && validMenuItemId
      ? createCustomerDishDetailQueryKey(identityId, menuItemId)
      : [
          ...customerDishDetailQueryPrefix,
          'disabled',
          identityId ?? 'no-customer-session',
          menuItemId,
        ] as const;

  const query = useQuery({
    queryKey,
    queryFn: ({signal}) =>
      dishDetailApi.getCustomerDishDetail(menuItemId, signal),
    enabled: Boolean(identityId && validMenuItemId),
  });

  return {
    ...query,
    invalidMenuItemId: !validMenuItemId,
    sessionRequired: identityId === null,
  };
}
