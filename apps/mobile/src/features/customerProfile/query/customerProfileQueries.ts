import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {AppApiError} from '../../../core/http/apiError';
import {
  CustomerProfileContractError,
  customerProfileApi,
} from '../api/customerProfileApi';
import {
  createCustomerProfileEmptyState,
  createCustomerProfileErrorState,
  createCustomerProfileLoadingState,
  createCustomerProfileReadyState,
  type CustomerProfileHubContract,
  type CustomerProfileHubState,
} from '../domain/customerProfileContract';
import type {CustomerProfileUpdateRequest} from '../domain/customerProfileEditForm';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const CUSTOMER_PROFILE_DOMAIN = 'customer-profile';

export const customerProfileQueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_PROFILE_DOMAIN,
] as const;

export function createCustomerProfileQueryKey(identityId: string) {
  return createPrivateQueryKey(CUSTOMER_PROFILE_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
  });
}

export function invalidateCustomerProfileQuery(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient
    .invalidateQueries({queryKey: customerProfileQueryPrefix})
    .then(() => undefined);
}

export function writeCustomerProfileQuery(
  queryClient: QueryClient,
  identityId: string,
  profile: CustomerProfileHubContract,
): void {
  queryClient.setQueryData(createCustomerProfileQueryKey(identityId), profile);
}

export function resolveCustomerProfileHubState(input: {
  data: CustomerProfileHubContract | null | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
}): CustomerProfileHubState {
  if (input.isPending) {
    return createCustomerProfileLoadingState();
  }
  if (input.isError) {
    return createCustomerProfileErrorState(
      input.error instanceof CustomerProfileContractError
        ? 'invalid-response'
        : 'request-failed',
    );
  }
  if (!input.data) {
    return createCustomerProfileEmptyState();
  }
  return createCustomerProfileReadyState(input.data);
}

export function useCustomerProfileQuery() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createCustomerProfileQueryKey(identityId)
    : ([...customerProfileQueryPrefix, 'disabled'] as const);

  const query = useQuery({
    queryKey,
    queryFn: ({signal}) => customerProfileApi.getProfile(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
  });

  return {
    ...query,
    contractState: resolveCustomerProfileHubState({
      data: query.data,
      isPending: query.isPending,
      isError: query.isError,
      error: query.error,
    }),
    sessionRequired: identityId === null,
  };
}

export function useUpdateCustomerProfileMutation() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...customerProfileQueryPrefix, 'update'],
    mutationFn: (request: CustomerProfileUpdateRequest) => {
      if (!identityId) {
        throw new AppApiError(
          'SESSION_REQUIRED',
          'Sign in again before changing your profile.',
        );
      }
      return customerProfileApi.updateProfile(request);
    },
    retry: false,
    onSuccess: profile => {
      if (identityId) {
        writeCustomerProfileQuery(queryClient, identityId, profile);
      }
    },
  });
}
