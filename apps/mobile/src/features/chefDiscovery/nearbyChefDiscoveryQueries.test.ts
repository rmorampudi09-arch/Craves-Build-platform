import {QueryClient} from '@tanstack/react-query';
import type {CustomerBrowsingLocation} from '../customerShell/state/customerShellSlice';
import type {NearbyKitchenPage} from './api/nearbyChefDiscoveryApi';
import {
  createNearbyChefDiscoveryQueryKey,
  getNextNearbyChefDiscoveryPage,
  invalidateNearbyChefDiscoveryQueries,
} from './query/nearbyChefDiscoveryQueries';

const location: CustomerBrowsingLocation = {
  kind: 'SAVED_ADDRESS',
  addressId: '11111111-1111-4111-8111-111111111111',
  label: 'HOME',
  displayName: 'Madhapur',
  latitude: 17.4483,
  longitude: 78.3915,
};

function page(pageNumber: number, hasNext: boolean): NearbyKitchenPage {
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
    kitchens: [],
  };
}

describe('P34 nearby chef discovery query model', () => {
  it('keys cached nearby kitchens by customer, exact saved location coordinates, radius, and page size', () => {
    const first = createNearbyChefDiscoveryQueryKey('customer-1', location, {
      radiusMeters: 10000,
      size: 20,
    });
    const second = createNearbyChefDiscoveryQueryKey('customer-1', location, {
      radiusMeters: 10000,
      size: 50,
    });

    expect(first).not.toEqual(second);
    expect(first[4]).toMatchObject({
      userId: 'customer-1',
      role: 'CUSTOMER',
      locationKey: location.addressId,
      filters: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      paging: {radiusMeters: 10000, size: 20},
    });
  });

  it('changes the cache key when coordinates change for the same saved address', () => {
    const first = createNearbyChefDiscoveryQueryKey('customer-1', location, {
      radiusMeters: 10000,
      size: 20,
    });
    const movedLocation: CustomerBrowsingLocation = {
      ...location,
      latitude: 17.45,
    };
    const second = createNearbyChefDiscoveryQueryKey('customer-1', movedLocation, {
      radiusMeters: 10000,
      size: 20,
    });

    expect(first).not.toEqual(second);
  });

  it('uses authoritative hasNext metadata for pagination', () => {
    expect(getNextNearbyChefDiscoveryPage(page(0, true))).toBe(1);
    expect(getNextNearbyChefDiscoveryPage(page(1, false))).toBeUndefined();
  });

  it('invalidates only nearby chef discovery variants when location changes', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {queries: {gcTime: Infinity}},
    });
    const chefKey = createNearbyChefDiscoveryQueryKey('customer-1', location, {
      radiusMeters: 10000,
      size: 20,
    });
    const unrelatedKey = ['craves', 'v1', 'private', 'orders', {}] as const;

    queryClient.setQueryData(chefKey, page(0, false));
    queryClient.setQueryData(unrelatedKey, {orders: []});

    await invalidateNearbyChefDiscoveryQueries(queryClient);

    expect(queryClient.getQueryState(chefKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
    queryClient.clear();
  });
});
