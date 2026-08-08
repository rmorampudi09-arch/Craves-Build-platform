import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {customerOrdersApi} from '../api/customerOrdersApi';
import {createCustomerOrdersSnapshot} from '../domain/customerOrdersModel';
import {CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT} from '../api/customerOrdersApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const CUSTOMER_ORDERS_DOMAIN = 'customer-orders';

export const customerOrdersQueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_ORDERS_DOMAIN,
] as const;

export function createCustomerOrdersQueryKey(identityId: string) {
  return createPrivateQueryKey(CUSTOMER_ORDERS_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    paging: {serverWindowLimit: CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT},
  });
}

export function invalidateCustomerOrdersQueries(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient
    .invalidateQueries({queryKey: customerOrdersQueryPrefix})
    .then(() => undefined);
}

export function useCustomerOrdersQuery() {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createCustomerOrdersQueryKey(identityId)
    : [...customerOrdersQueryPrefix, 'disabled'] as const;

  const query = useQuery({
    queryKey,
    queryFn: async ({signal}) =>
      createCustomerOrdersSnapshot(await customerOrdersApi.listRecentOrders(signal)),
    enabled: identityId !== null,
    staleTime: 30_000,
  });

  return {
    ...query,
    sessionRequired: identityId === null,
    cancelPendingRequest: () =>
      queryClient.cancelQueries({queryKey, exact: true}).then(() => undefined),
  };
}
