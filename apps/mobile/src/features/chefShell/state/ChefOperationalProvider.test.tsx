import React from 'react';
import {act, create} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {chefNotificationInboxApi, markAllChefNoticesRead} from '../api/chefNotificationInboxApi';
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
  chefNotificationInboxApi: {page: jest.fn(), unreadCount: jest.fn(), markRead: jest.fn()},
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
  // By default the server has not published the new inbox, so the older one is used.
  get(chefNotificationInboxApi.page).mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
  get(chefNotificationInboxApi.unreadCount).mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
  get(chefOperationalApi.listNotifications).mockResolvedValue([
    notice(CUSTOMER_NOTICE, 'Order created. Complete payment to continue', 'ORDER_CREATED'),
    notice(CHEF_NOTICE, 'New order', 'CHEF_ORDER_AWAITING_ACCEPTANCE'),
  ]);
});

describe('ChefOperationalProvider notification inbox choice', () => {
  const page = (notices: ReturnType<typeof notice>[]) => ({notices, nextCursor: null, hasMore: false});

  it('asks for the new inbox first, shows its chef notices and its unread count', async () => {
    get(chefNotificationInboxApi.page).mockResolvedValue(
      page([
        notice(CUSTOMER_NOTICE, 'Order created. Complete payment to continue', 'ORDER_CREATED'),
        notice(CHEF_NOTICE, 'New order', 'CHEF_ORDER_AWAITING_ACCEPTANCE'),
      ]),
    );
    get(chefNotificationInboxApi.unreadCount).mockResolvedValue({unreadCount: 4});
    const state = await mountProvider();
    expect(chefNotificationInboxApi.page).toHaveBeenCalledTimes(1);
    expect(chefOperationalApi.listNotifications).not.toHaveBeenCalled();
    // The chef-audience filter still applies to what the new inbox returns.
    expect(state.current.notices.map(n => n.id)).toEqual([CHEF_NOTICE]);
    expect(state.current.counters.unreadNotifications).toBe(4);
    expect(state.current.notificationsStatus).toBe('success');
  });

  it('falls back to the older inbox, once, when the new one is not published, and never asks the new one again', async () => {
    const state = await mountProvider();
    expect(chefNotificationInboxApi.page).toHaveBeenCalledTimes(1);
    expect(chefOperationalApi.listNotifications).toHaveBeenCalledTimes(1);
    expect(state.current.notices.map(n => n.id)).toEqual([CHEF_NOTICE]);
    expect(state.current.notificationsStatus).toBe('success');
    // The count is worked out from the chef notices, not taken from a route that is not there.
    expect(state.current.counters.unreadNotifications).toBe(1);

    await act(async () => {
      await state.current.refresh();
    });
    await settle();
    expect(chefNotificationInboxApi.page).toHaveBeenCalledTimes(1);
    expect(chefNotificationInboxApi.unreadCount).toHaveBeenCalledTimes(1);
    expect(chefOperationalApi.listNotifications).toHaveBeenCalledTimes(2);
  });

  it('marks a notice read on the older inbox after the fallback', async () => {
    get(chefOperationalApi.markNotificationRead).mockResolvedValue(undefined);
    const state = await mountProvider();
    await act(async () => {
      state.current.markNotificationRead(CHEF_NOTICE);
    });
    await settle();
    expect(chefOperationalApi.markNotificationRead).toHaveBeenCalledWith(CHEF_NOTICE);
    expect(chefNotificationInboxApi.markRead).not.toHaveBeenCalled();
    expect(state.current.counters.unreadNotifications).toBe(0);
  });

  it('keeps a real failure of the new inbox as an error instead of silently switching inbox', async () => {
    get(chefNotificationInboxApi.page).mockRejectedValue(new AppApiError('HTTP_500', 'Boom', 500));
    const state = await mountProvider();
    expect(chefOperationalApi.listNotifications).not.toHaveBeenCalled();
    expect(state.current.notificationsStatus).toBe('error');
  });
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
