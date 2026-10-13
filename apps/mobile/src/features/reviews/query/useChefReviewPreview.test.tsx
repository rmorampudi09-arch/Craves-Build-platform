import React from 'react';
import {act, create} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {chefReviewsApi} from '../api/chefReviewsApi';
import {useChefReviewPreview} from './useChefReviewPreview';

jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'chef-1'}}}),
}));
jest.mock('../api/chefReviewsApi', () => ({
  chefReviewsApi: {list: jest.fn(), summary: jest.fn()},
}));

const KITCHEN_ID = '11111111-1111-4111-8111-111111111111';
const review = {
  reviewId: '22222222-2222-4222-8222-222222222222',
  kitchenId: KITCHEN_ID,
  overallRating: 5,
  reviewText: 'Tasted like home',
  tagCodes: [],
  publishedAt: '2026-10-12T10:00:00Z',
};
const get = (mock: unknown) => mock as jest.Mock;

async function mountHook() {
  const result: {current: ReturnType<typeof useChefReviewPreview>} = {current: undefined as never};
  function Probe() {
    result.current = useChefReviewPreview();
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
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 10));
    });
  }
  return result;
}

beforeEach(() => jest.clearAllMocks());

describe('useChefReviewPreview', () => {
  it('asks the server for reviews instead of skipping the call, then reads the kitchen summary', async () => {
    get(chefReviewsApi.list).mockResolvedValue({items: [review], nextCursor: null, hasMore: false});
    get(chefReviewsApi.summary).mockResolvedValue({kitchenId: KITCHEN_ID, reviewCount: 1, overallAverage: 4.6});
    const state = await mountHook();
    expect(chefReviewsApi.list).toHaveBeenCalledTimes(1);
    expect(state.current.available).toBe(true);
    expect(state.current.reviews).toEqual([review]);
    expect(state.current.summary?.overallAverage).toBe(4.6);
  });

  it('is unavailable, not an error, when the reviews route is not published yet', async () => {
    get(chefReviewsApi.list).mockRejectedValue(new AppApiError('NOT_FOUND', 'No route', 404));
    const state = await mountHook();
    expect(state.current.available).toBe(false);
    expect(state.current.reviews).toEqual([]);
    expect(chefReviewsApi.summary).not.toHaveBeenCalled();
  });

  it('stays available and reports the error when the call fails for another reason', async () => {
    get(chefReviewsApi.list).mockRejectedValue(new AppApiError('SERVER', 'Boom', 500));
    const state = await mountHook();
    expect(state.current.available).toBe(true);
    expect(state.current.error).toBeTruthy();
  });
});
