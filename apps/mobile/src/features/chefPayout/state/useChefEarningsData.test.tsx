import React from 'react';
import {act, create} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {chefMenuApi} from '../../chefMenu/api/chefMenuApi';
import {chefOrderHistoryApi} from '../../chefOrders/api/chefOrderHistoryApi';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {useChefEarningsData} from './useChefEarningsData';

jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'chef-1'}}}),
}));
jest.mock('./useChefPayoutData', () => ({
  useChefPayoutData: () => ({isRefreshing: false, refresh: async () => undefined, ledger: [], ledgerLimit: 200}),
}));
let mockLive: ChefOperationalOrder[] = [];
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({orders: mockLive, ordersStatus: 'success', isRefreshing: false, refresh: async () => undefined}),
}));
jest.mock('../../chefOrders/api/chefOrderHistoryApi', () => ({
  ...jest.requireActual('../../chefOrders/api/chefOrderHistoryApi'),
  chefOrderHistoryApi: {page: jest.fn()},
}));
jest.mock('../../chefMenu/api/chefMenuApi', () => ({
  ...jest.requireActual('../../chefMenu/api/chefMenuApi'),
  chefMenuApi: {listItems: jest.fn()},
}));

const page = chefOrderHistoryApi.page as jest.Mock;
const listItems = chefMenuApi.listItems as jest.Mock;
const at = (day: number, month = 9) => new Date(2026, month, day, 12).toISOString();
const order = (id: string, iso: string): ChefOperationalOrder => ({id, status: 'DELIVERED', createdAt: iso, updatedAt: iso});

async function mountHook(historyFrom: Date | null) {
  const result: {current: ReturnType<typeof useChefEarningsData>} = {current: undefined as never};
  function Probe() {
    result.current = useChefEarningsData({historyFrom});
    return null;
  }
  const queryClient = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}});
  await act(async () => {
    create(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return result;
}
const settle = async () => {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 20));
    });
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLive = [];
  listItems.mockResolvedValue([]);
});

describe('useChefEarningsData older orders', () => {
  it('asks for older pages until the range is covered, then stops', async () => {
    page
      .mockResolvedValueOnce({orders: [order('a', at(12)), order('b', at(8))], nextCursor: 'c1', hasMore: true})
      .mockResolvedValueOnce({orders: [order('c', at(3)), order('d', at(28, 8))], nextCursor: 'c2', hasMore: true});
    const state = await mountHook(new Date(2026, 9, 1));
    await settle();
    expect(page).toHaveBeenCalledTimes(2);
    expect(state.current.orders.map(item => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(state.current.historyFailed).toBe(false);
    expect(state.current.historyIncomplete).toBe(false);
  });

  it('after a failed page, makes no more calls on its own and offers a retry that makes exactly one', async () => {
    page
      .mockResolvedValueOnce({orders: [order('a', at(12)), order('b', at(8))], nextCursor: 'c1', hasMore: true})
      // A real page takes a moment to fail, so the "loading" state is seen before the failure, as on a phone.
      .mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(new AppApiError('SERVER', 'Boom', 500)), 15)));
    const state = await mountHook(new Date(2026, 9, 1));
    await settle();
    expect(page).toHaveBeenCalledTimes(2); // the first page, and the one extra that failed
    expect(state.current.historyFailed).toBe(true);
    expect(state.current.historyIncomplete).toBe(true);
    expect(state.current.orders.map(item => item.id)).toEqual(['a', 'b']);

    await act(async () => state.current.retryHistory());
    await settle();
    expect(page).toHaveBeenCalledTimes(3);
  });

  it('stops at the page cap and says the older orders are missing', async () => {
    const full = Array.from({length: 400}, (_, index) => order(`o${index}`, new Date(2026, 9, 12, 12, 0, 400 - index).toISOString()));
    page.mockResolvedValue({orders: full, nextCursor: 'more', hasMore: true});
    const state = await mountHook(new Date(2026, 9, 1));
    await settle();
    expect(page).toHaveBeenCalledTimes(1);
    expect(state.current.historyCapped).toBe(true);
    expect(state.current.historyIncomplete).toBe(true);
  });

  it('reads no older pages when no range needs them', async () => {
    page.mockResolvedValue({orders: [order('a', at(12))], nextCursor: 'c1', hasMore: true});
    await mountHook(null);
    await settle();
    expect(page).toHaveBeenCalledTimes(1);
  });
});

describe('useChefEarningsData dish photos', () => {
  it('maps each dish to its main photo', async () => {
    page.mockResolvedValue({orders: [], nextCursor: null, hasMore: false});
    listItems.mockResolvedValue([
      {id: 'dish-1', images: [{primary: false, publicUrl: 'https://img/2.jpg'}, {primary: true, publicUrl: 'https://img/1.jpg'}]},
      {id: 'dish-2', images: []},
    ]);
    const state = await mountHook(null);
    await settle();
    expect(state.current.dishPhotos).toEqual({'dish-1': 'https://img/1.jpg'});
  });
});

// The live list is only the latest orders, so "no older orders" must never be read as "no orders before the range".
describe('useChefEarningsData: are the orders complete back to the start of the range?', () => {
  const from = new Date(2026, 9, 1);

  it('is not when the server does not publish the order history route', async () => {
    page.mockRejectedValue(new AppApiError('NOT_FOUND', 'No route', 404));
    mockLive = [order('live', at(12))];
    const state = await mountHook(from);
    await settle();
    expect(state.current.historyFailed).toBe(false); // an unpublished route is not an error to show
    expect(state.current.historyIncomplete).toBe(true);
    expect(state.current.coversFrom(from)).toBe(false);
  });

  it('is not when the first page failed, and a retry reads that page again', async () => {
    page.mockRejectedValueOnce(new AppApiError('SERVER', 'Boom', 500));
    mockLive = [order('live', at(12))];
    const state = await mountHook(from);
    await settle();
    expect(page).toHaveBeenCalledTimes(1);
    expect(state.current.historyFailed).toBe(true);
    expect(state.current.historyIncomplete).toBe(true);

    page.mockResolvedValue({orders: [order('a', at(11)), order('b', at(28, 8))], nextCursor: null, hasMore: false});
    await act(async () => state.current.retryHistory());
    await settle();
    expect(page).toHaveBeenCalledTimes(2); // the first page again, not a no-op
    expect(state.current.historyFailed).toBe(false);
    expect(state.current.historyIncomplete).toBe(false);
    expect(state.current.orders.map(item => item.id)).toEqual(['live', 'a', 'b']);
  });

  it('is not when there are no older orders at all, unless the live list itself reaches back before the range', async () => {
    page.mockResolvedValue({orders: [], nextCursor: null, hasMore: false});
    mockLive = [order('live', at(12))];
    const short = await mountHook(from);
    await settle();
    expect(short.current.historyIncomplete).toBe(true);

    mockLive = [order('live', at(12)), order('old', at(25, 8))];
    const long = await mountHook(from);
    await settle();
    expect(long.current.historyIncomplete).toBe(false);
  });

  it('is when the older orders ran out of pages with at least one order', async () => {
    page.mockResolvedValue({orders: [order('a', at(11)), order('b', at(5))], nextCursor: null, hasMore: false});
    mockLive = [order('live', at(12))];
    const state = await mountHook(from);
    await settle();
    expect(state.current.historyIncomplete).toBe(false);
    expect(state.current.coversFrom(new Date(2026, 0, 1))).toBe(true); // every order there is, so any start is covered
  });

  it('says it is still loading until the first page and the pages the range needs are in', async () => {
    page.mockResolvedValue({orders: [order('a', at(11))], nextCursor: null, hasMore: false});
    const state = await mountHook(from);
    expect(state.current.historyLoading).toBe(true);
    await settle();
    expect(state.current.historyLoading).toBe(false);
  });
});
