import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {useChefOrderHistoryQuery} from './chefOrderHistoryQueries';

const mockPage = jest.fn();
jest.mock('../api/chefOrderHistoryApi', () => ({
  ...jest.requireActual('../api/chefOrderHistoryApi'),
  chefOrderHistoryApi: {page: (...args: unknown[]) => mockPage(...args)},
}));
jest.mock('../../../app/store/hooks', () => ({useAppSelector: () => 'user-1'}));

const order = (suffix: string): ChefOperationalOrder => ({id: `00000000-0000-4000-8000-0000000000${suffix}`, status: 'DELIVERED'});

describe('useChefOrderHistoryQuery', () => {
  let tree: renderer.ReactTestRenderer;
  let history: ReturnType<typeof useChefOrderHistoryQuery>;
  const mount = async () => {
    function Probe() {
      history = useChefOrderHistoryQuery();
      return null;
    }
    await act(async () => {
      tree = renderer.create(
        <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    for (let tick = 0; tick < 4; tick += 1) {
      await act(async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      });
    }
  };

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(() => tree.unmount()));

  it('asks for every status, a page at a time', async () => {
    mockPage.mockResolvedValue({orders: [order('a1')], nextCursor: 'c2', hasMore: true});
    await mount();
    expect(mockPage).toHaveBeenCalledWith(expect.objectContaining({limit: 20, cursor: null}));
    expect(mockPage.mock.calls[0][0]).not.toHaveProperty('status');
    expect(history.orders).toHaveLength(1);
    expect(history.hasNextPage).toBe(true);
  });

  it('loads the next page once, however often the end of the list is reached', async () => {
    mockPage.mockResolvedValueOnce({orders: [order('a1')], nextCursor: 'c2', hasMore: true});
    mockPage.mockResolvedValueOnce({orders: [order('a2')], nextCursor: null, hasMore: false});
    await mount();
    await act(async () => {
      history.loadOlder();
      history.loadOlder();
    });
    for (let tick = 0; tick < 3; tick += 1) {
      await act(async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      });
    }
    expect(mockPage).toHaveBeenCalledTimes(2);
    expect(mockPage).toHaveBeenLastCalledWith(expect.objectContaining({cursor: 'c2'}));
    expect(history.orders).toHaveLength(2);
    expect(history.hasNextPage).toBe(false);
  });

  it('is silently empty when the server does not publish the history route', async () => {
    mockPage.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    await mount();
    expect(history.orders).toEqual([]);
    expect(history.hasNextPage).toBe(false);
    expect(mockPage).toHaveBeenCalledTimes(1);
  });
});
