import {QueryClient} from '@tanstack/react-query';
import type {CustomerBrowsingLocation} from '../customerShell/state/customerShellSlice';
import {createHomeNearbyDishesQueryKey} from '../home/query/homeFeedQueries';
import {
  createCustomerDishDetailQueryKey,
  invalidateCustomerDishFavoriteCaches,
} from './query/dishDetailQueries';

const menuItemId = '11111111-1111-4111-8111-111111111111';
const otherMenuItemId = '22222222-2222-4222-8222-222222222222';
const location: CustomerBrowsingLocation = {
  kind: 'SAVED_ADDRESS',
  addressId: '33333333-3333-4333-8333-333333333333',
  label: 'HOME',
  displayName: 'Madhapur',
  latitude: 17.4483,
  longitude: 78.3915,
};

describe('P39 dish detail query and cache ownership', () => {
  it('keys detail cache by customer identity and the stable backend menu-item identity', () => {
    const first = createCustomerDishDetailQueryKey('customer-1', menuItemId);
    const second = createCustomerDishDetailQueryKey(
      'customer-1',
      otherMenuItemId,
    );
    const otherCustomer = createCustomerDishDetailQueryKey(
      'customer-2',
      menuItemId,
    );

    expect(first).not.toEqual(second);
    expect(first).not.toEqual(otherCustomer);
    expect(first[4]).toMatchObject({
      userId: 'customer-1',
      role: 'CUSTOMER',
      entityId: menuItemId,
    });
  });

  it('rejects a synthetic/non-backend dish identity', () => {
    expect(() =>
      createCustomerDishDetailQueryKey('customer-1', 'dish-card-12'),
    ).toThrow('menuItemId must be a valid UUID.');
  });

  it('invalidates only the affected customer detail and existing dish-list caches after a future favorite mutation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {queries: {gcTime: Infinity}},
    });
    const detailKey = createCustomerDishDetailQueryKey(
      'customer-1',
      menuItemId,
    );
    const otherDishKey = createCustomerDishDetailQueryKey(
      'customer-1',
      otherMenuItemId,
    );
    const otherCustomerDetailKey = createCustomerDishDetailQueryKey(
      'customer-2',
      menuItemId,
    );
    const homeKey = createHomeNearbyDishesQueryKey('customer-1', location, {
      radiusMeters: 10000,
      size: 20,
    });
    const otherCustomerHomeKey = createHomeNearbyDishesQueryKey(
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

    queryClient.setQueryData(detailKey, {id: menuItemId});
    queryClient.setQueryData(otherDishKey, {id: otherMenuItemId});
    queryClient.setQueryData(otherCustomerDetailKey, {id: menuItemId});
    queryClient.setQueryData(homeKey, {pages: []});
    queryClient.setQueryData(otherCustomerHomeKey, {pages: []});
    queryClient.setQueryData(unrelatedKey, {orders: []});

    await invalidateCustomerDishFavoriteCaches(
      queryClient,
      'customer-1',
      menuItemId,
    );

    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(homeKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherDishKey)?.isInvalidated).toBe(false);
    expect(
      queryClient.getQueryState(otherCustomerDetailKey)?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(otherCustomerHomeKey)?.isInvalidated,
    ).toBe(false);
    expect(queryClient.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
    queryClient.clear();
  });
});
