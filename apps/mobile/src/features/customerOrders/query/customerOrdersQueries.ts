import {useEffect} from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  CUSTOMER_ORDER_HISTORY_PAGE_SIZE,
  CUSTOMER_ORDER_HISTORY_V2_AVAILABLE,
  customerOrderHistoryApi,
} from '../api/customerOrderHistoryApi';
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
const CUSTOMER_ORDERS_V2_DOMAIN = 'customer-orders-v2';
const CUSTOMER_ORDER_TRACKING_DOMAIN = 'customer-order-tracking';

export const customerOrdersQueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_ORDERS_DOMAIN,
] as const;

export const customerOrdersV2QueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_ORDERS_V2_DOMAIN,
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

export function createCustomerOrdersV2QueryKey(identityId: string) {
  return createPrivateQueryKey(CUSTOMER_ORDERS_V2_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    paging: {limit: CUSTOMER_ORDER_HISTORY_PAGE_SIZE},
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
  return Promise.all([
    queryClient.invalidateQueries({queryKey: customerOrdersQueryPrefix}),
    queryClient.invalidateQueries({queryKey: customerOrdersV2QueryPrefix}),
  ]).then(() => undefined);
}

export function useCustomerOrdersQuery() {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const legacyQueryKey = identityId
    ? createCustomerOrdersQueryKey(identityId)
    : ([...customerOrdersQueryPrefix, 'disabled'] as const);
  const v2QueryKey = identityId
    ? createCustomerOrdersV2QueryKey(identityId)
    : ([...customerOrdersV2QueryPrefix, 'disabled'] as const);

  const legacyQuery = useQuery({
    queryKey: legacyQueryKey,
    queryFn: async ({signal}) =>
      createCustomerOrdersSnapshot(
        await customerOrdersApi.listRecentOrders(signal),
      ),
    enabled: identityId !== null && !CUSTOMER_ORDER_HISTORY_V2_AVAILABLE,
    staleTime: 30_000,
  });

  const v2Query = useInfiniteQuery({
    queryKey: v2QueryKey,
    queryFn: ({pageParam, signal}) =>
      customerOrderHistoryApi.page({
        limit: CUSTOMER_ORDER_HISTORY_PAGE_SIZE,
        cursor: pageParam,
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
    enabled: identityId !== null && CUSTOMER_ORDER_HISTORY_V2_AVAILABLE,
    staleTime: 30_000,
  });

  const v2Orders =
    v2Query.data?.pages.flatMap(page => page.orders) ?? [];
  const v2Snapshot = v2Query.data
    ? createCustomerOrdersSnapshot(v2Orders, !v2Query.hasNextPage)
    : undefined;

  return {
    data: CUSTOMER_ORDER_HISTORY_V2_AVAILABLE
      ? v2Snapshot
      : legacyQuery.data,
    error: CUSTOMER_ORDER_HISTORY_V2_AVAILABLE
      ? v2Query.error
      : legacyQuery.error,
    identityId,
    sessionRequired: identityId === null,
    v2Available: CUSTOMER_ORDER_HISTORY_V2_AVAILABLE,
    isPending: CUSTOMER_ORDER_HISTORY_V2_AVAILABLE
      ? v2Query.isPending
      : legacyQuery.isPending,
    isError: CUSTOMER_ORDER_HISTORY_V2_AVAILABLE
      ? v2Query.isError
      : legacyQuery.isError,
    isFetching: CUSTOMER_ORDER_HISTORY_V2_AVAILABLE
      ? v2Query.isFetching
      : legacyQuery.isFetching,
    isRefetching: CUSTOMER_ORDER_HISTORY_V2_AVAILABLE
      ? v2Query.isRefetching
      : legacyQuery.isRefetching,
    hasNextPage: CUSTOMER_ORDER_HISTORY_V2_AVAILABLE
      ? Boolean(v2Query.hasNextPage)
      : false,
    isFetchingNextPage: CUSTOMER_ORDER_HISTORY_V2_AVAILABLE
      ? v2Query.isFetchingNextPage
      : false,
    fetchNextPage: () =>
      CUSTOMER_ORDER_HISTORY_V2_AVAILABLE
        ? v2Query.fetchNextPage().then(() => undefined)
        : Promise.resolve(),
    refetch: () =>
      CUSTOMER_ORDER_HISTORY_V2_AVAILABLE
        ? v2Query.refetch()
        : legacyQuery.refetch(),
    cancelPendingRequest: () =>
      queryClient
        .cancelQueries({
          queryKey: CUSTOMER_ORDER_HISTORY_V2_AVAILABLE
            ? v2QueryKey
            : legacyQueryKey,
          exact: true,
        })
        .then(() => undefined),
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

    if (CUSTOMER_ORDER_HISTORY_V2_AVAILABLE) {
      void queryClient.invalidateQueries({
        queryKey: createCustomerOrdersV2QueryKey(identityId),
        exact: true,
      });
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
