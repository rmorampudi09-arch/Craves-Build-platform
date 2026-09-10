import {QueryClient} from '@tanstack/react-query';
import type {CustomerBrowsingLocation} from '../customerShell/state/customerShellSlice';
import {createNearbyChefDiscoveryQueryKey} from '../chefDiscovery/query/nearbyChefDiscoveryQueries';
import {
  createCustomerKitchenProfileQueryKey,
  invalidateCustomerKitchenFavoriteCaches,
} from './query/kitchenProfileQueries';

const kitchenId = '11111111-1111-4111-8111-111111111111';
const otherKitchenId = '22222222-2222-4222-8222-222222222222';
const location: CustomerBrowsingLocation = {
  kind: 'SAVED_ADDRESS',
  addressId: '33333333-3333-4333-8333-333333333333',
  label: 'HOME',
  displayName: 'Madhapur',
  latitude: 17.4483,
  longitude: 78.3915,
};

describe('P42 customer kitchen profile query and cache ownership', () => {
  it('keys profile cache by customer identity and stable backend kitchen identity', () => {
    const first = createCustomerKitchenProfileQueryKey(
      'customer-1',
      kitchenId,
    );
    const second = createCustomerKitchenProfileQueryKey(
      'customer-1',
      otherKitchenId,
    );
    const otherCustomer = createCustomerKitchenProfileQueryKey(
      'customer-2',
      kitchenId,
    );

    expect(first).not.toEqual(second);
    expect(first).not.toEqual(otherCustomer);
    expect(first[4]).toMatchObject({
      userId: 'customer-1',
      role: 'CUSTOMER',
      entityId: kitchenId,
    });
  });

  it('rejects a synthetic/non-backend kitchen identity', () => {
    expect(() =>
      createCustomerKitchenProfileQueryKey('customer-1', 'chef-card-12'),
    ).toThrow('kitchenId must be a valid UUID.');
  });

  it('invalidates only the affected customer profile and nearby-chef caches after a future kitchen favorite mutation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {queries: {gcTime: Infinity}},
    });
    const profileKey = createCustomerKitchenProfileQueryKey(
      'customer-1',
      kitchenId,
    );
    const otherKitchenKey = createCustomerKitchenProfileQueryKey(
      'customer-1',
      otherKitchenId,
    );
    const otherCustomerProfileKey = createCustomerKitchenProfileQueryKey(
      'customer-2',
      kitchenId,
    );
    const nearbyKey = createNearbyChefDiscoveryQueryKey(
      'customer-1',
      location,
      {
        radiusMeters: 10000,
        size: 20,
      },
    );
    const otherCustomerNearbyKey = createNearbyChefDiscoveryQueryKey(
      'customer-2',
      location,
      {
        radiusMeters: 10000,
        size: 20,
      },
    );
    const unrelatedKey = [
      'craves',
      'v1',
      'private',
      'customer-orders',
      {userId: 'customer-1', role: 'CUSTOMER'},
    ] as const;

    queryClient.setQueryData(profileKey, {id: kitchenId});
    queryClient.setQueryData(otherKitchenKey, {id: otherKitchenId});
    queryClient.setQueryData(otherCustomerProfileKey, {id: kitchenId});
    queryClient.setQueryData(nearbyKey, {pages: []});
    queryClient.setQueryData(otherCustomerNearbyKey, {pages: []});
    queryClient.setQueryData(unrelatedKey, {orders: []});

    await invalidateCustomerKitchenFavoriteCaches(
      queryClient,
      'customer-1',
      kitchenId,
    );

    expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(nearbyKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherKitchenKey)?.isInvalidated).toBe(
      false,
    );
    expect(
      queryClient.getQueryState(otherCustomerProfileKey)?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(otherCustomerNearbyKey)?.isInvalidated,
    ).toBe(false);
    expect(queryClient.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
    queryClient.clear();
  });
});
