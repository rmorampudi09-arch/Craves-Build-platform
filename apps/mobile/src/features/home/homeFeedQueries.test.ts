import {QueryClient} from '@tanstack/react-query';
import type {CustomerBrowsingLocation} from '../customerShell/state/customerShellSlice';
import type {NearbyDishPage} from './api/homeFeedApi';
import {
  createHomeNearbyDishesQueryKey,
  getHomeFeedContractBlocker,
  getNextHomeFeedPage,
  invalidateCustomerHomeFeedQueries,
} from './query/homeFeedQueries';

const location: CustomerBrowsingLocation = {
  kind: 'SAVED_ADDRESS',
  addressId: '11111111-1111-4111-8111-111111111111',
  label: 'HOME',
  displayName: 'Madhapur',
  latitude: 17.4483,
  longitude: 78.3915,
};

function page(pageNumber: number, hasNext: boolean): NearbyDishPage {
  return {
    latitude: 17.4483,
    longitude: 78.3915,
    radiusMeters: 10000,
    page: {
      page: pageNumber,
      size: 20,
      totalElements: hasNext ? 40 : 20,
      totalPages: hasNext ? 2 : 1,
      hasNext,
    },
    menuItems: [],
  };
}

describe('P31 home feed query model', () => {
  it('keys cached discovery by customer, saved location, filters, radius, and page size', () => {
    const first = createHomeNearbyDishesQueryKey('customer-1', location, {
      radiusMeters: 10000,
      size: 20,
      filters: {category: null, cuisine: null},
    });
    const second = createHomeNearbyDishesQueryKey('customer-1', location, {
      radiusMeters: 10000,
      size: 50,
      filters: {category: null, cuisine: null},
    });

    expect(first).not.toEqual(second);
    expect(first[4]).toMatchObject({
      userId: 'customer-1',
      role: 'CUSTOMER',
      locationKey: location.addressId,
      paging: {radiusMeters: 10000, size: 20},
    });
  });

  it('blocks category and cuisine filters instead of silently inventing query parameters', () => {
    expect(getHomeFeedContractBlocker({category: 'Meals'})).toContain(
      'category query parameter',
    );
    expect(getHomeFeedContractBlocker({cuisine: 'Telugu'})).toContain(
      'cuisine query parameter',
    );
    expect(getHomeFeedContractBlocker()).toBeNull();
  });

  it('uses authoritative hasNext metadata for pagination', () => {
    expect(getNextHomeFeedPage(page(0, true))).toBe(1);
    expect(getNextHomeFeedPage(page(1, false))).toBeUndefined();
  });

  it('invalidates all current home discovery variants on location change', async () => {
    const queryClient = new QueryClient();
    const homeKey = createHomeNearbyDishesQueryKey('customer-1', location, {
      radiusMeters: 10000,
      size: 20,
    });
    const unrelatedKey = ['craves', 'v1', 'private', 'orders', {}] as const;

    queryClient.setQueryData(homeKey, page(0, false));
    queryClient.setQueryData(unrelatedKey, {orders: []});

    await invalidateCustomerHomeFeedQueries(queryClient);

    expect(queryClient.getQueryState(homeKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
  });
});
