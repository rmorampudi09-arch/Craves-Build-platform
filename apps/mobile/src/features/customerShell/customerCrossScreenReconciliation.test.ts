import {QueryClient} from '@tanstack/react-query';
import {nearbyChefDiscoveryQueryPrefix} from '../chefDiscovery/query/nearbyChefDiscoveryQueries';
import {customerHomeFeedQueryPrefix} from '../home/query/homeFeedQueries';
import {
  clearDeletedCustomerLocation,
  invalidateCustomerLocationDependentQueries,
  reconcileSelectedCustomerLocation,
} from './query/customerLocationReconciliation';
import type {CustomerBrowsingLocation} from './state/customerShellSlice';

const currentLocation: CustomerBrowsingLocation = {
  kind: 'SAVED_ADDRESS',
  addressId: '11111111-1111-4111-8111-111111111111',
  label: 'Home',
  displayName: 'Indiranagar',
  latitude: 12.9784,
  longitude: 77.6408,
};

const updatedLocation: CustomerBrowsingLocation = {
  ...currentLocation,
  displayName: 'Domlur',
  latitude: 12.9611,
  longitude: 77.6387,
};

describe('P79 customer cross-screen reconciliation', () => {
  it('reconciles an authoritative update into the selected global location', () => {
    expect(
      reconcileSelectedCustomerLocation(currentLocation, updatedLocation),
    ).toEqual(updatedLocation);

    const unrelated: CustomerBrowsingLocation = {
      ...updatedLocation,
      addressId: '22222222-2222-4222-8222-222222222222',
    };
    expect(reconcileSelectedCustomerLocation(currentLocation, unrelated)).toBe(
      currentLocation,
    );
  });

  it('clears the selected global location only when that saved address was deleted', () => {
    expect(
      clearDeletedCustomerLocation(currentLocation, currentLocation.addressId),
    ).toBeNull();
    expect(
      clearDeletedCustomerLocation(
        currentLocation,
        '22222222-2222-4222-8222-222222222222',
      ),
    ).toBe(currentLocation);
  });

  it('invalidates both customer discovery domains when location changes', async () => {
    const queryClient = new QueryClient();
    const homeKey = [...customerHomeFeedQueryPrefix, 'location-a'] as const;
    const chefsKey = [...nearbyChefDiscoveryQueryPrefix, 'location-a'] as const;

    queryClient.setQueryData(homeKey, {pages: []});
    queryClient.setQueryData(chefsKey, {pages: []});

    await invalidateCustomerLocationDependentQueries(queryClient);

    expect(queryClient.getQueryState(homeKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(chefsKey)?.isInvalidated).toBe(true);
  });
});
