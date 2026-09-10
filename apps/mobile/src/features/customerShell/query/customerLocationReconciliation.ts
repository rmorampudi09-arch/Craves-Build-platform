import type {QueryClient} from '@tanstack/react-query';
import {nearbyChefDiscoveryQueryPrefix} from '../../chefDiscovery/query/nearbyChefDiscoveryQueries';
import {customerHomeFeedQueryPrefix} from '../../home/query/homeFeedQueries';
import type {CustomerBrowsingLocation} from '../state/customerShellSlice';

export async function invalidateCustomerLocationDependentQueries(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({queryKey: customerHomeFeedQueryPrefix}),
    queryClient.invalidateQueries({queryKey: nearbyChefDiscoveryQueryPrefix}),
  ]);
}

export function reconcileSelectedCustomerLocation(
  current: CustomerBrowsingLocation | null,
  authoritative: CustomerBrowsingLocation,
): CustomerBrowsingLocation | null {
  return current?.addressId === authoritative.addressId
    ? authoritative
    : current;
}

export function clearDeletedCustomerLocation(
  current: CustomerBrowsingLocation | null,
  deletedAddressId: string,
): CustomerBrowsingLocation | null {
  return current?.addressId === deletedAddressId ? null : current;
}
