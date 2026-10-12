import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefScheduledOrder} from '../api/chefScheduledOrdersApi';
import {useChefScheduledOrdersQueue, type ChefScheduledOrdersQueue} from './useChefScheduledOrdersQueue';

const mockList = jest.fn();
const mockRespond = jest.fn();
jest.mock('../api/chefScheduledOrdersApi', () => ({
  ...jest.requireActual('../api/chefScheduledOrdersApi'),
  chefScheduledOrdersApi: {
    list: (...args: unknown[]) => mockList(...args),
    respond: (...args: unknown[]) => mockRespond(...args),
  },
}));
jest.mock('../../../app/store/hooks', () => ({useAppSelector: () => 'user-1'}));

const item = (orderId: string, hoursAhead: number, responseStatus: 'PENDING' | 'ACCEPTED'): ChefScheduledOrder => ({
  scheduleRequestId: '00000000-0000-4000-8000-0000000000a1',
  checkoutId: '00000000-0000-4000-8000-0000000000a2',
  orderId,
  kitchenId: '00000000-0000-4000-8000-0000000000a3',
  requestedFulfilmentAt: new Date(Date.now() + hoursAhead * 3_600_000).toISOString(),
  requestedTimezone: 'Asia/Kolkata',
  scheduleStatus: responseStatus === 'PENDING' ? 'PENDING_CHEF_CONFIRMATION' : 'CONFIRMED',
  responseStatus,
  paymentGate: 'PAYMENT_BEFORE_CHEF_CONFIRMATION',
  responseNote: null,
  responseVersion: 3,
  respondedAt: responseStatus === 'PENDING' ? null : '2026-10-14T08:00:00Z',
  createdAt: '2026-10-14T07:00:00Z',
});

describe('useChefScheduledOrdersQueue', () => {
  let tree: renderer.ReactTestRenderer;
  let queue: ChefScheduledOrdersQueue;
  const mount = async () => {
    function Probe() {
      queue = useChefScheduledOrdersQueue();
      return null;
    }
    await act(async () => {
      tree = renderer.create(
        <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    // React Query hands results to React on a timer; let a few of them run.
    for (let tick = 0; tick < 4; tick += 1) {
      await act(async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      });
    }
  };

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(() => tree.unmount()));

  it('is unavailable, with no error and no second request, when the server does not publish the route', async () => {
    mockList.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    await mount();
    expect(queue.unavailable).toBe(true);
    expect(queue.status).toBe('success');
    expect(queue.pending).toEqual([]);
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('does not ask for confirmed requests on a refresh when the route is not published', async () => {
    mockList.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    await mount();
    await act(async () => {
      await queue.refresh();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockList.mock.calls.every(([options]) => options.responseStatus === 'PENDING')).toBe(true);
  });

  it('treats a body-less 403 from the gateway the same way', async () => {
    mockList.mockRejectedValue(new AppApiError('HTTP_403', 'Forbidden', 403));
    await mount();
    expect(queue.unavailable).toBe(true);
  });

  it('keeps a real failure as an error, not as "coming soon"', async () => {
    mockList.mockRejectedValue(new AppApiError('HTTP_500', 'boom', 500));
    await mount();
    expect(queue.unavailable).toBe(false);
    expect(queue.status).toBe('error');
  });

  it('lists requests waiting for an answer, and confirmed ones that are still ahead', async () => {
    mockList.mockImplementation(async (options: {responseStatus: string}) => ({
      items:
        options.responseStatus === 'PENDING'
          ? [item('00000000-0000-4000-8000-0000000000b1', 20, 'PENDING')]
          : [item('00000000-0000-4000-8000-0000000000b2', -2, 'ACCEPTED'), item('00000000-0000-4000-8000-0000000000b3', 30, 'ACCEPTED')],
      nextCursor: null,
      hasMore: false,
    }));
    await mount();
    expect(queue.unavailable).toBe(false);
    expect(queue.pending.map(entry => entry.orderId)).toEqual(['00000000-0000-4000-8000-0000000000b1']);
    expect(queue.confirmed.map(entry => entry.orderId)).toEqual(['00000000-0000-4000-8000-0000000000b3']);
  });

  it('answers a request with the version it read and the reason as the note', async () => {
    const pending = item('00000000-0000-4000-8000-0000000000b1', 20, 'PENDING');
    mockList.mockResolvedValue({items: [pending], nextCursor: null, hasMore: false});
    mockRespond.mockResolvedValue({});
    await mount();
    await act(async () => {
      await queue.respond(pending, 'REJECT', 'Closing soon');
    });
    expect(mockRespond).toHaveBeenCalledWith(pending.scheduleRequestId, pending.orderId, {
      action: 'REJECT',
      responseNote: 'Closing soon',
      expectedVersion: 3,
    });
  });
});
