import {
  useInfiniteQuery,
  type QueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import type {CustomerBrowsingLocation} from '../../customerShell/state/customerShellSlice';
import {
  homeFeedApi,
  type NearbyDishPage,
} from '../api/homeFeedApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const HOME_NEARBY_DISHES_DOMAIN = 'customer-home-nearby-dishes';
export const customerHomeFeedQueryPrefix = [
  'craves',
  'v1',
  'private',
  HOME_NEARBY_DISHES_DOMAIN,
] as const;

export interface HomeFeedFilters {
  category?: string | null;
  cuisine?: string | null;
}

export interface HomeNearbyDishQueryOptions {
  radiusMeters: number;
  size: number;
  filters?: HomeFeedFilters;
}

function normalizeOptionalFilter(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

export function getHomeFeedContractBlocker(
  filters: HomeFeedFilters = {},
): string | null {
  const category = normalizeOptionalFilter(filters.category);
  const cuisine = normalizeOptionalFilter(filters.cuisine);

  if (category && cuisine) {
    return 'The current discovery contract does not define category or cuisine query parameters.';
  }
  if (category) {
    return 'The current discovery contract does not define a category query parameter.';
  }
  if (cuisine) {
    return 'The current discovery contract does not define a cuisine query parameter.';
  }
  return null;
}

export function createHomeNearbyDishesQueryKey(
  identityId: string,
  location: CustomerBrowsingLocation,
  options: HomeNearbyDishQueryOptions,
) {
  const filters = options.filters ?? {};
  return createPrivateQueryKey(HOME_NEARBY_DISHES_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    locationKey: location.addressId,
    filters: {
      category: normalizeOptionalFilter(filters.category),
      cuisine: normalizeOptionalFilter(filters.cuisine),
    },
    paging: {
      radiusMeters: options.radiusMeters,
      size: options.size,
    },
  });
}

export function getNextHomeFeedPage(
  lastPage: NearbyDishPage,
): number | undefined {
  return lastPage.page.hasNext ? lastPage.page.page + 1 : undefined;
}

export function invalidateCustomerHomeFeedQueries(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient
    .invalidateQueries({queryKey: customerHomeFeedQueryPrefix})
    .then(() => undefined);
}

export function useHomeNearbyDishesQuery(
  options: HomeNearbyDishQueryOptions,
) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const location = useAppSelector(state => state.customerShell.selectedLocation);
  const contractBlocker = getHomeFeedContractBlocker(options.filters);
  const queryEnabled = Boolean(identityId && location && !contractBlocker);

  const query = useInfiniteQuery({
    queryKey:
      identityId && location
        ? createHomeNearbyDishesQueryKey(identityId, location, options)
        : [...customerHomeFeedQueryPrefix, 'disabled'],
    queryFn: ({pageParam, signal}) => {
      if (!location) {
        throw new Error('A saved customer location is required for discovery.');
      }
      return homeFeedApi.listNearbyDishes(
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
    getNextPageParam: getNextHomeFeedPage,
    enabled: queryEnabled,
    staleTime: 5 * 60_000,
  });

  return {
    ...query,
    contractBlocker,
    locationRequired: location === null,
  };
}
