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
  homeFeedApi,
  type NearbyDishPage,
} from '../api/homeFeedApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const HOME_NEARBY_DISHES_DOMAIN = 'customer-home-nearby-dishes';
export const HOME_FEED_MAX_RETAINED_PAGES = 10;
export const customerHomeFeedQueryPrefix = [
  'craves',
  'v1',
  'private',
  HOME_NEARBY_DISHES_DOMAIN,
] as const;

export interface HomeFeedFilters {
  query?: string | null;
  category?: string | null;
  cuisine?: string | null;
  foodType?: 'VEG' | 'NON_VEG' | 'EGG' | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  maxPreparationTimeMinutes?: number | null;
  spiceLevel?: 'MILD' | 'MEDIUM' | 'SPICY' | null;
  sort?: 'DISTANCE_ASC' | 'PRICE_ASC' | 'PRICE_DESC' | 'PREPARATION_TIME_ASC' | 'NAME_ASC' | null;
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

  if (cuisine) {
    return 'Cuisine IDs are not part of the current Discovery v2 contract. Use the server category filter instead.';
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
      query: normalizeOptionalFilter(filters.query),
      category: normalizeOptionalFilter(filters.category),
      cuisine: normalizeOptionalFilter(filters.cuisine),
      foodType: filters.foodType ?? null,
      minPrice: filters.minPrice ?? null,
      maxPrice: filters.maxPrice ?? null,
      maxPreparationTimeMinutes: filters.maxPreparationTimeMinutes ?? null,
      spiceLevel: filters.spiceLevel ?? null,
      sort: filters.sort ?? 'DISTANCE_ASC',
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
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const location = useAppSelector(state => state.customerShell.selectedLocation);
  const contractBlocker = getHomeFeedContractBlocker(options.filters);
  const queryEnabled = Boolean(identityId && location && !contractBlocker);
  const queryKey =
    identityId && location
      ? createHomeNearbyDishesQueryKey(identityId, location, options)
      : ([...customerHomeFeedQueryPrefix, 'disabled'] as const);

  const query = useInfiniteQuery({
    queryKey,
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
          query: options.filters?.query,
          category: options.filters?.category,
          foodType: options.filters?.foodType,
          minPrice: options.filters?.minPrice,
          maxPrice: options.filters?.maxPrice,
          maxPreparationTimeMinutes: options.filters?.maxPreparationTimeMinutes,
          spiceLevel: options.filters?.spiceLevel,
          sort: options.filters?.sort,
        },
        signal,
      );
    },
    initialPageParam: 0,
    getNextPageParam: getNextHomeFeedPage,
    maxPages: HOME_FEED_MAX_RETAINED_PAGES,
    enabled: queryEnabled,
    staleTime: queryStaleTimes.discoveryMs,
  });

  return {
    ...query,
    contractBlocker,
    locationRequired: location === null,
    cancelPendingRequest: () =>
      queryClient.cancelQueries({queryKey, exact: true}).then(() => undefined),
  };
}
