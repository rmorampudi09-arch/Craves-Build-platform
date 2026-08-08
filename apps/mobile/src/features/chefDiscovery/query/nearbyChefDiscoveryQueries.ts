import {
  useInfiniteQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import type {CustomerBrowsingLocation} from '../../customerShell/state/customerShellSlice';
import {
  nearbyChefDiscoveryApi,
  type NearbyKitchenPage,
} from '../api/nearbyChefDiscoveryApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const NEARBY_CHEF_DISCOVERY_DOMAIN = 'customer-nearby-chef-discovery';

export const nearbyChefDiscoveryQueryPrefix = [
  'craves',
  'v1',
  'private',
  NEARBY_CHEF_DISCOVERY_DOMAIN,
] as const;

export interface NearbyChefDiscoveryQueryOptions {
  radiusMeters: number;
  size: number;
}

export function createNearbyChefDiscoveryQueryKey(
  identityId: string,
  location: CustomerBrowsingLocation,
  options: NearbyChefDiscoveryQueryOptions,
) {
  return createPrivateQueryKey(NEARBY_CHEF_DISCOVERY_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    locationKey: location.addressId,
    filters: {
      latitude: location.latitude,
      longitude: location.longitude,
    },
    paging: {
      radiusMeters: options.radiusMeters,
      size: options.size,
    },
  });
}

export function getNextNearbyChefDiscoveryPage(
  lastPage: NearbyKitchenPage,
): number | undefined {
  return lastPage.page.hasNext ? lastPage.page.page + 1 : undefined;
}

export function invalidateNearbyChefDiscoveryQueries(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient
    .invalidateQueries({queryKey: nearbyChefDiscoveryQueryPrefix})
    .then(() => undefined);
}

export function useNearbyChefDiscoveryQuery(
  options: NearbyChefDiscoveryQueryOptions,
) {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const location = useAppSelector(state => state.customerShell.selectedLocation);
  const queryEnabled = Boolean(identityId && location);
  const queryKey =
    identityId && location
      ? createNearbyChefDiscoveryQueryKey(identityId, location, options)
      : [...nearbyChefDiscoveryQueryPrefix, 'disabled'] as const;

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({pageParam, signal}) => {
      if (!location) {
        throw new Error('A saved customer location is required for nearby chef discovery.');
      }
      return nearbyChefDiscoveryApi.listNearbyKitchens(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          radiusMeters: options.radiusMeters,
          page: pageParam,
          size: options.size,
        },
        signal,
      );
    },
    initialPageParam: 0,
    getNextPageParam: getNextNearbyChefDiscoveryPage,
    enabled: queryEnabled,
    staleTime: 5 * 60_000,
  });

  return {
    ...query,
    locationRequired: location === null,
    cancelPendingRequest: () =>
      queryClient.cancelQueries({queryKey, exact: true}).then(() => undefined),
  };
}
