import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {chefMenuApi} from '../../chefMenu/api/chefMenuApi';
import {getChefMenuPrimaryImageUrl} from '../../chefMenu/domain/chefMenuPresentation';
import {useChefOrderHistoryQuery} from '../../chefOrders/query/chefOrderHistoryQueries';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';
import {MAX_HISTORY_ORDERS, needsOlderOrders, olderOrdersMissing, ordersCoverFrom} from '../domain/chefEarningsSummary';
import {useChefPayoutData} from './useChefPayoutData';

const CHEF_ROLE = 'CHEF' as const;

/**
 * Everything the Earnings tab reads. Orders are the live list plus, when the server publishes it, the older
 * orders (a page at a time, only as far back as `historyFrom`); a server without that route just leaves the live list.
 * Paging stops on its own after a failed page and after the cap; `retryHistory` asks once more.
 */
export function useChefEarningsData({historyFrom}: {historyFrom: Date | null}) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const payout = useChefPayoutData();
  const operational = useChefOperationalState();
  const history = useChefOrderHistoryQuery();

  const orders = React.useMemo(() => {
    const live = new Set(operational.orders.map(order => order.id));
    return [...operational.orders, ...history.orders.filter(order => !live.has(order.id))] as ChefOperationalOrder[];
  }, [operational.orders, history.orders]);

  const fromTime = historyFrom?.getTime() ?? null;
  const {
    orders: older,
    hasNextPage,
    isFetchingNextPage,
    pending: historyPending,
    failed: historyFailed,
    loadOlder,
    refresh: refreshHistory,
  } = history;
  const query = {historyOrders: older, hasNextPage, from: new Date(fromTime ?? 0)};
  const missing = fromTime !== null && olderOrdersMissing(query);
  const coversFrom = (from: Date) =>
    ordersCoverFrom({liveOrders: operational.orders, historyOrders: older, hasNextPage, historyFailed, from});
  const wantMore = fromTime !== null && !isFetchingNextPage && !historyFailed && needsOlderOrders(query);
  const loadRef = React.useRef(loadOlder);
  loadRef.current = loadOlder;
  // Keyed on how many orders are loaded, not on the list itself, which is a new array every render.
  React.useEffect(() => {
    if (wantMore) loadRef.current();
  }, [wantMore, older.length]);

  const menuQuery = useQuery({
    queryKey: identityId
      ? createPrivateQueryKey('chef-menu-items', {userId: identityId, role: CHEF_ROLE})
      : (['craves', 'v1', 'private', 'chef-menu-items', 'signed-out'] as const),
    queryFn: ({signal}) => chefMenuApi.listItems(signal),
    enabled: identityId !== null,
    staleTime: 60_000,
  });
  const dishPhotos = React.useMemo(() => {
    const photos: Record<string, string> = {};
    for (const item of menuQuery.data ?? []) {
      const url = getChefMenuPrimaryImageUrl(item);
      if (url) photos[item.id] = url;
    }
    return photos;
  }, [menuQuery.data]);

  const {refresh: refreshPayout} = payout;
  const {refresh: refreshOperational} = operational;
  const refresh = React.useCallback(async () => {
    await Promise.allSettled([refreshPayout(), refreshOperational(), refreshHistory()]);
  }, [refreshPayout, refreshOperational, refreshHistory]);

  return {
    ...payout,
    orders,
    ordersStatus: operational.ordersStatus,
    dishPhotos,
    /** Reading older orders failed; what is shown may be missing some. */
    historyFailed,
    /** The cap was reached before the range was covered. */
    historyCapped: missing && !historyFailed && older.length >= MAX_HISTORY_ORDERS,
    /** The orders may not reach back to `historyFrom`, for any reason (see `ordersCoverFrom`): counts and changes there are not known. */
    historyIncomplete: fromTime !== null && !coversFrom(new Date(fromTime)),
    /** Whether the orders are known to reach back to `from` (the start of the range being shown). */
    coversFrom,
    /** The first read, or a page the range needs, is still on its way. */
    historyLoading: historyPending || isFetchingNextPage || wantMore,
    /** Reads the next page, or the first one again when it never arrived. */
    retryHistory: () => {
      if (hasNextPage) {
        loadOlder();
      } else {
        refreshHistory().catch(() => undefined);
      }
    },
    isRefreshing: payout.isRefreshing || operational.isRefreshing,
    refresh,
  };
}
