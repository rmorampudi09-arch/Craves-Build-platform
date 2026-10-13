import React from 'react';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';
import {useChefOrderHistoryQuery} from '../../chefOrders/query/chefOrderHistoryQueries';
import {needsOlderOrders} from '../domain/chefEarningsSummary';
import {useChefPayoutData} from './useChefPayoutData';

/**
 * Everything the Earnings tab reads. Orders are the live list plus, when the server publishes it, the older
 * orders (a page at a time, only as far back as `historyFrom`); a server without that route just leaves the live list.
 */
export function useChefEarningsData({historyFrom}: {historyFrom: Date | null}) {
  const payout = useChefPayoutData();
  const operational = useChefOperationalState();
  const history = useChefOrderHistoryQuery();

  const orders = React.useMemo(() => {
    const live = new Set(operational.orders.map(order => order.id));
    return [...operational.orders, ...history.orders.filter(order => !live.has(order.id))] as ChefOperationalOrder[];
  }, [operational.orders, history.orders]);

  const fromTime = historyFrom?.getTime() ?? null;
  const {orders: older, hasNextPage, isFetchingNextPage, loadOlder} = history;
  React.useEffect(() => {
    if (fromTime === null || isFetchingNextPage) return;
    if (needsOlderOrders({historyOrders: older, hasNextPage, from: new Date(fromTime)})) loadOlder();
  }, [fromTime, older, hasNextPage, isFetchingNextPage, loadOlder]);

  const {refresh: refreshPayout} = payout;
  const {refresh: refreshOperational} = operational;
  const {refresh: refreshHistory} = history;
  const refresh = React.useCallback(async () => {
    await Promise.allSettled([refreshPayout(), refreshOperational(), refreshHistory()]);
  }, [refreshPayout, refreshOperational, refreshHistory]);

  return {
    ...payout,
    orders,
    ordersStatus: operational.ordersStatus,
    isRefreshing: payout.isRefreshing || operational.isRefreshing,
    refresh,
  };
}
