import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {AppApiError} from '../../../core/http/apiError';
import {customerAddressesApi} from '../api/customerAddressesApi';
import type {
  CustomerAddress,
  CustomerAddressUpdateRequest,
} from '../domain/customerAddressContract';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const CUSTOMER_ADDRESSES_DOMAIN = 'customer-addresses';

export const customerAddressesQueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_ADDRESSES_DOMAIN,
] as const;

export const customerSavedLocationsQueryPrefix = [
  'craves',
  'v1',
  'private',
  'customer-saved-locations',
] as const;

export function createCustomerAddressesQueryKey(identityId: string) {
  return createPrivateQueryKey(CUSTOMER_ADDRESSES_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
  });
}

export async function invalidateCustomerAddressQueries(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({queryKey: customerAddressesQueryPrefix}),
    queryClient.invalidateQueries({queryKey: customerSavedLocationsQueryPrefix}),
  ]);
}

export function useCustomerAddressesQuery() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const query = useQuery({
    queryKey: identityId
      ? createCustomerAddressesQueryKey(identityId)
      : ([...customerAddressesQueryPrefix, 'disabled'] as const),
    queryFn: ({signal}) => customerAddressesApi.list(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
  });

  return {
    ...query,
    addresses: query.data ?? [],
    sessionRequired: identityId === null,
  };
}

function requireAddressSession(identityId: string | null): void {
  if (!identityId) {
    throw new AppApiError(
      'SESSION_REQUIRED',
      'Sign in again before changing your saved addresses.',
    );
  }
}

export function useUpdateCustomerAddressMutation() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...customerAddressesQueryPrefix, 'update'],
    mutationFn: ({
      addressId,
      request,
    }: {
      addressId: string;
      request: CustomerAddressUpdateRequest;
    }) => {
      requireAddressSession(identityId);
      return customerAddressesApi.update(addressId, request);
    },
    retry: false,
    onSuccess: async () => invalidateCustomerAddressQueries(queryClient),
  });
}

export function useSetDefaultCustomerAddressMutation() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...customerAddressesQueryPrefix, 'set-default'],
    mutationFn: (address: CustomerAddress) => {
      requireAddressSession(identityId);
      return customerAddressesApi.setDefault(address);
    },
    retry: false,
    onSuccess: async () => invalidateCustomerAddressQueries(queryClient),
  });
}

export function useDeleteCustomerAddressMutation() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...customerAddressesQueryPrefix, 'delete'],
    mutationFn: (addressId: string) => {
      requireAddressSession(identityId);
      return customerAddressesApi.delete(addressId);
    },
    retry: false,
    onSuccess: async () => invalidateCustomerAddressQueries(queryClient),
  });
}
