import {useEffect, useMemo, useRef} from 'react';
import {useCustomerOrdersQuery} from '../customerOrders/query/customerOrdersQueries';
import {getLiveOrder} from './liveOrderModel';

const LIVE_ORDER_REFRESH_MS = 30_000;

export function useLiveOrder() {
  const orders = useCustomerOrdersQuery();
  const live = useMemo(() => getLiveOrder(orders.data?.orders ?? []), [orders.data]);
  const refetchRef = useRef(orders.refetch);
  refetchRef.current = orders.refetch;
  const liveOrderId = live?.orderId ?? null;

  // shortcut: polls the recent-orders list while an order is live; switch to push updates once orders publish them.
  useEffect(() => {
    if (!liveOrderId) return undefined;
    const interval = setInterval(() => {
      void refetchRef.current();
    }, LIVE_ORDER_REFRESH_MS);
    return () => clearInterval(interval);
  }, [liveOrderId]);

  return live;
}
