import {useQuery, type QueryClient} from '@tanstack/react-query';
import {
  createPrivateQueryKey,
  matchesPrivateQueryScope,
} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {nearbyChefDiscoveryQueryPrefix} from '../../chefDiscovery/query/nearbyChefDiscoveryQueries';
import {
  isCustomerKitchenId,
  kitchenProfileApi,
} from '../api/kitchenProfileApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const CUSTOMER_KITCHEN_PROFILE_DOMAIN = 'customer-kitchen-profile';

export const customerKitchenProfileQueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_KITCHEN_PROFILE_DOMAIN,
] as const;

export function createCustomerKitchenProfileQueryKey(
  identityId: string,
  kitchenId: string,
) {
  if (!isCustomerKitchenId(kitchenId)) {
    throw new Error('kitchenId must be a valid UUID.');
  }

  return createPrivateQueryKey(CUSTOMER_KITCHEN_PROFILE_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    entityId: kitchenId.trim(),
  });
}

function hasPrefix(
  queryKey: readonly unknown[],
  prefix: readonly unknown[],
): boolean {
  return prefix.every((value, index) => queryKey[index] === value);
}

function isNearbyChefQueryForIdentity(
  queryKey: readonly unknown[],
  identityId: string,
): boolean {
  return (
    hasPrefix(queryKey, nearbyChefDiscoveryQueryPrefix) &&
    matchesPrivateQueryScope(queryKey, {
      userId: identityId,
      role: CUSTOMER_ROLE,
    })
  );
}

/**
 * Cache reconciliation boundary for a future authoritative customer kitchen-favorite mutation.
 * P42 deliberately does not define or call a favorite endpoint because none exists in the
 * accepted current-branch contract.
 */
export async function invalidateCustomerKitchenFavoriteCaches(
  queryClient: QueryClient,
  identityId: string,
  kitchenId: string,
): Promise<void> {
  const profileKey = createCustomerKitchenProfileQueryKey(
    identityId,
    kitchenId,
  );

  await Promise.all([
    queryClient.invalidateQueries({queryKey: profileKey, exact: true}),
    queryClient.invalidateQueries({
      predicate: query =>
        isNearbyChefQueryForIdentity(query.queryKey, identityId),
    }),
  ]);
}

export function useCustomerKitchenProfileQuery(kitchenId: string) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const validKitchenId = isCustomerKitchenId(kitchenId);
  const queryKey =
    identityId && validKitchenId
      ? createCustomerKitchenProfileQueryKey(identityId, kitchenId)
      : [
          ...customerKitchenProfileQueryPrefix,
          'disabled',
          identityId ?? 'no-customer-session',
          kitchenId,
        ] as const;

  const query = useQuery({
    queryKey,
    queryFn: ({signal}) =>
      kitchenProfileApi.getCustomerKitchenProfile(kitchenId, signal),
    enabled: Boolean(identityId && validKitchenId),
  });

  return {
    ...query,
    invalidKitchenId: !validKitchenId,
    sessionRequired: identityId === null,
  };
}
