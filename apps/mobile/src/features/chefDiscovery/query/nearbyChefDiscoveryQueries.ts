import {
  useInfiniteQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {queryStaleTimes} from '../../../app/query/queryPolicy';
import {useAppSelector} from '../../../app/store/hooks';
import type {CustomerBrowsingLocation} from '../../customerShell/state/customerShellSlice';
import {
  nearbyChefDiscoveryApi,
  type NearbyKitchenPage,
} from '../api/nearbyChefDiscoveryApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const NEARBY_CHEF_DISCOVERY_DOMAIN = 'customer-nearby-chef-discovery';
export const NEARBY_CHEF_DISCOVERY_MAX_RETAINED_PAGES = 10;

export const nearbyChefDiscoveryQueryPrefix = [
  'craves',
  'v1',
  'private',
  NEARBY_CHEF_DISCOVERY_DOMAIN,
] as const;

export interface NearbyChefDiscoveryQueryOptions {
  radiusMeters: number;
  size: number;
  query?: string | null;
  category?: string | null;
  foodType?: 'VEG' | 'NON_VEG' | 'EGG' | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  maxPreparationTimeMinutes?: number | null;
  spiceLevel?: 'MILD' | 'MEDIUM' | 'SPICY' | null;
  sort?: 'DISTANCE_ASC' | 'NAME_ASC' | null;
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
      query: options.query?.trim() || null,
      category: options.category?.trim() || null,
      foodType: options.foodType ?? null,
      minPrice: options.minPrice ?? null,
      maxPrice: options.maxPrice ?? null,
      maxPreparationTimeMinutes: options.maxPreparationTimeMinutes ?? null,
      spiceLevel: options.spiceLevel ?? null,
      sort: options.sort ?? 'DISTANCE_ASC',
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
      : ([...nearbyChefDiscoveryQueryPrefix, 'disabled'] as const);

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
          query: options.query,
          category: options.category,
          foodType: options.foodType,
          minPrice: options.minPrice,
          maxPrice: options.maxPrice,
          maxPreparationTimeMinutes: options.maxPreparationTimeMinutes,
          spiceLevel: options.spiceLevel,
          sort: options.sort,
        },
        signal,
      );
    },
    initialPageParam: 0,
    getNextPageParam: getNextNearbyChefDiscoveryPage,
    maxPages: NEARBY_CHEF_DISCOVERY_MAX_RETAINED_PAGES,
    enabled: queryEnabled,
    staleTime: queryStaleTimes.discoveryMs,
  });

  return {
    ...query,
    locationRequired: location === null,
    cancelPendingRequest: () =>
      queryClient.cancelQueries({queryKey, exact: true}).then(() => undefined),
  };
}
