import {useEffect} from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {customerOrderTrackingApi} from '../api/customerOrderTrackingApi';
import {
  customerOrdersApi,
  isCustomerOrderId,
} from '../api/customerOrdersApi';
import {createCustomerOrdersSnapshot} from '../domain/customerOrdersModel';
import {
  CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT,
  type CustomerOrdersSnapshot,
} from '../domain/customerOrderTypes';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const CUSTOMER_ORDERS_DOMAIN = 'customer-orders';
const CUSTOMER_ORDER_TRACKING_DOMAIN = 'customer-order-tracking';

export const customerOrdersQueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_ORDERS_DOMAIN,
] as const;

export const customerOrderTrackingQueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_ORDER_TRACKING_DOMAIN,
] as const;

export function createCustomerOrdersQueryKey(identityId: string) {
  return createPrivateQueryKey(CUSTOMER_ORDERS_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    paging: {serverWindowLimit: CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT},
  });
}

export function createCustomerOrderDetailQueryKey(
  identityId: string,
  orderId: string,
) {
  return createPrivateQueryKey(CUSTOMER_ORDERS_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    entityId: orderId,
  });
}

export function createCustomerOrderTrackingQueryKey(
  identityId: string,
  orderId: string,
) {
  return createPrivateQueryKey(CUSTOMER_ORDER_TRACKING_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    entityId: orderId,
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
    : ([...customerOrdersQueryPrefix, 'disabled'] as const);

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

export function useCustomerOrderDetailQuery(orderId: string) {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const validOrderId = isCustomerOrderId(orderId);
  const queryKey =
    identityId && validOrderId
      ? createCustomerOrderDetailQueryKey(identityId, orderId)
      : ([...customerOrdersQueryPrefix, 'detail-disabled', orderId] as const);

  const query = useQuery({
    queryKey,
    queryFn: ({signal}) => customerOrdersApi.getOrder(orderId, signal),
    enabled: identityId !== null && validOrderId,
    staleTime: 15_000,
  });

  useEffect(() => {
    const order = query.data;
    if (!identityId || !order) {
      return;
    }

    const listKey = createCustomerOrdersQueryKey(identityId);
    queryClient.setQueryData<CustomerOrdersSnapshot>(listKey, snapshot => {
      if (!snapshot) {
        return snapshot;
      }
      const index = snapshot.orders.findIndex(item => item.id === order.id);
      if (index < 0) {
        return snapshot;
      }
      const nextOrders = [...snapshot.orders];
      nextOrders[index] = order;
      return createCustomerOrdersSnapshot(nextOrders);
    });
  }, [identityId, query.data, queryClient]);

  return {
    ...query,
    invalidOrderId: !validOrderId,
    sessionRequired: identityId === null,
  };
}

export function useCustomerOrderTrackingQuery(orderId: string) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const validOrderId = isCustomerOrderId(orderId);
  const queryKey =
    identityId && validOrderId
      ? createCustomerOrderTrackingQueryKey(identityId, orderId)
      : ([...customerOrderTrackingQueryPrefix, 'disabled', orderId] as const);

  const query = useQuery({
    queryKey,
    queryFn: ({signal}) => customerOrderTrackingApi.getTracking(orderId, signal),
    enabled: identityId !== null && validOrderId,
    staleTime: 15_000,
  });

  return {
    ...query,
    invalidOrderId: !validOrderId,
    sessionRequired: identityId === null,
  };
}
