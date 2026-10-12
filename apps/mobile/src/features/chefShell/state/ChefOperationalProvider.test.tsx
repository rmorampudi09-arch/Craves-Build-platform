import React from 'react';
import {act, create} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {markAllChefNoticesRead} from '../api/chefNotificationInboxApi';
import {chefOperationalApi} from '../api/chefOperationalApi';
import {ChefOperationalProvider, useChefOperationalState} from './ChefOperationalProvider';

jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'chef-1'}}}),
}));
jest.mock('../api/chefOperationalApi', () => ({
  ...jest.requireActual('../api/chefOperationalApi'),
  chefOperationalApi: {listOrders: jest.fn(), listNotifications: jest.fn(), markNotificationRead: jest.fn()},
}));
jest.mock('../api/chefNotificationInboxApi', () => ({
  ...jest.requireActual('../api/chefNotificationInboxApi'),
  markAllChefNoticesRead: jest.fn(),
}));

const get = (mock: unknown) => mock as jest.Mock;
const CHEF_NOTICE = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_NOTICE = '22222222-2222-4222-8222-222222222222';
const notice = (id: string, title: string, noticeType: string) => ({
  id,
  title,
  body: 'Body',
  noticeType,
  targetType: 'ORDER',
  targetId: '33333333-3333-4333-8333-333333333333',
  readAt: null,
  createdAt: '2026-10-14T08:00:00Z',
});

// react-query hands cache changes to observers on a timer, so wait a beat before reading the state.
async function settle() {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
}

async function mountProvider() {
  const result: {current: ReturnType<typeof useChefOperationalState>} = {current: undefined as never};
  function Probe() {
    result.current = useChefOperationalState();
    return null;
  }
  const queryClient = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}});
  await act(async () => {
    create(
      <QueryClientProvider client={queryClient}>
        <ChefOperationalProvider>
          <Probe />
        </ChefOperationalProvider>
      </QueryClientProvider>,
    );
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 10));
    });
  }
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  get(chefOperationalApi.listOrders).mockResolvedValue([]);
  get(chefOperationalApi.listNotifications).mockResolvedValue([
    notice(CUSTOMER_NOTICE, 'Order created. Complete payment to continue', 'ORDER_CREATED'),
    notice(CHEF_NOTICE, 'New order', 'CHEF_ORDER_AWAITING_ACCEPTANCE'),
  ]);
});

describe('ChefOperationalProvider notifications', () => {
  it('keeps the customer order notices out of the list and out of the unread count', async () => {
    const state = await mountProvider();
    expect(state.current.notices.map(n => n.id)).toEqual([CHEF_NOTICE]);
    expect(state.current.counters.unreadNotifications).toBe(1);
  });

  it('marks only the visible chef notices read and clears the count', async () => {
    get(markAllChefNoticesRead).mockImplementation(async (ids: string[]) => ids);
    const state = await mountProvider();
    let all: boolean | undefined;
    await act(async () => {
      all = await state.current.markAllNotificationsRead();
    });
    await settle();
    expect(all).toBe(true);
    expect(markAllChefNoticesRead).toHaveBeenCalledWith([CHEF_NOTICE]);
    expect(state.current.counters.unreadNotifications).toBe(0);
    expect(state.current.notices[0].readAt).not.toBeNull();
  });

  it('says so when only some of the notices could be marked read, and keeps the rest unread', async () => {
    const SECOND_CHEF_NOTICE = '44444444-4444-4444-8444-444444444444';
    get(chefOperationalApi.listNotifications).mockResolvedValue([
      notice(CHEF_NOTICE, 'New order', 'CHEF_ORDER_AWAITING_ACCEPTANCE'),
      notice(SECOND_CHEF_NOTICE, 'Another order', 'CHEF_ORDER_AWAITING_ACCEPTANCE'),
    ]);
    get(markAllChefNoticesRead).mockResolvedValue([CHEF_NOTICE]);
    const state = await mountProvider();
    let all: boolean | undefined;
    await act(async () => {
      all = await state.current.markAllNotificationsRead();
    });
    await settle();
    expect(all).toBe(false);
    expect(state.current.counters.unreadNotifications).toBe(1);
  });
});
