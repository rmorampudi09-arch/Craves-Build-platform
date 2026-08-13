import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {AppApiError} from '../../../core/http/apiError';
import {customerShellActions} from '../../customerShell/state/customerShellSlice';
import {
  clearDeletedCustomerLocation,
  invalidateCustomerLocationDependentQueries,
  reconcileSelectedCustomerLocation,
} from '../../customerShell/query/customerLocationReconciliation';
import {customerAddressesApi} from '../api/customerAddressesApi';
import {
  toCustomerBrowsingLocation,
  type CustomerAddress,
  type CustomerAddressCreateRequest,
  type CustomerAddressUpdateRequest,
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

export function writeCustomerAddressQuery(
  queryClient: QueryClient,
  identityId: string,
  updated: CustomerAddress,
): void {
  queryClient.setQueryData<CustomerAddress[]>(
    createCustomerAddressesQueryKey(identityId),
    current => {
      if (!current) {
        return current;
      }
      const exists = current.some(address => address.id === updated.id);
      if (!exists) {
        return [updated, ...current];
      }
      return current.map(address =>
        address.id === updated.id ? updated : address,
      );
    },
  );
}

export function removeCustomerAddressFromQuery(
  queryClient: QueryClient,
  identityId: string,
  addressId: string,
): void {
  queryClient.setQueryData<CustomerAddress[]>(
    createCustomerAddressesQueryKey(identityId),
    current => current?.filter(address => address.id !== addressId) ?? current,
  );
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

function useAddressMutationReconciliation() {
  const dispatch = useAppDispatch();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const selectedLocation = useAppSelector(
    state => state.customerShell.selectedLocation,
  );
  const queryClient = useQueryClient();

  const reconcileSavedAddress = async (updated: CustomerAddress) => {
    if (identityId) {
      writeCustomerAddressQuery(queryClient, identityId, updated);
    }

    const authoritativeLocation = toCustomerBrowsingLocation(updated);
    if (authoritativeLocation) {
      const reconciledLocation = reconcileSelectedCustomerLocation(
        selectedLocation,
        authoritativeLocation,
      );
      if (reconciledLocation !== selectedLocation && reconciledLocation) {
        dispatch(customerShellActions.locationSelected(reconciledLocation));
        await invalidateCustomerLocationDependentQueries(queryClient);
      }
    }

    await invalidateCustomerAddressQueries(queryClient);
  };

  return {
    dispatch,
    identityId,
    selectedLocation,
    queryClient,
    reconcileSavedAddress,
  };
}

export function useCreateCustomerAddressMutation() {
  const reconciliation = useAddressMutationReconciliation();

  return useMutation({
    mutationKey: [...customerAddressesQueryPrefix, 'create'],
    mutationFn: (request: CustomerAddressCreateRequest) => {
      requireAddressSession(reconciliation.identityId);
      return customerAddressesApi.create(request);
    },
    retry: false,
    onSuccess: reconciliation.reconcileSavedAddress,
  });
}

export function useUpdateCustomerAddressMutation() {
  const reconciliation = useAddressMutationReconciliation();

  return useMutation({
    mutationKey: [...customerAddressesQueryPrefix, 'update'],
    mutationFn: ({
      addressId,
      request,
    }: {
      addressId: string;
      request: CustomerAddressUpdateRequest;
    }) => {
      requireAddressSession(reconciliation.identityId);
      return customerAddressesApi.update(addressId, request);
    },
    retry: false,
    onSuccess: reconciliation.reconcileSavedAddress,
  });
}

export function useDeleteCustomerAddressMutation() {
  const dispatch = useAppDispatch();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const selectedLocation = useAppSelector(
    state => state.customerShell.selectedLocation,
  );
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...customerAddressesQueryPrefix, 'delete'],
    mutationFn: (addressId: string) => {
      requireAddressSession(identityId);
      return customerAddressesApi.delete(addressId);
    },
    retry: false,
    onSuccess: async (_result, addressId) => {
      if (identityId) {
        removeCustomerAddressFromQuery(queryClient, identityId, addressId);
      }

      const reconciledLocation = clearDeletedCustomerLocation(
        selectedLocation,
        addressId,
      );
      if (reconciledLocation !== selectedLocation) {
        dispatch(customerShellActions.locationCleared());
        await invalidateCustomerLocationDependentQueries(queryClient);
      }

      await invalidateCustomerAddressQueries(queryClient);
    },
  });
}
