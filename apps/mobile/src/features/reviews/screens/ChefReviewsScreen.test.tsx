import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {screenQueries} from '../../chefProfile/testing/screenTestKit';
import type {PublicKitchenReview} from '../api/publicKitchenReviewsApi';
import {ChefReviewsScreen} from './ChefReviewsScreen';

jest.setTimeout(20_000);

const mockApi = {list: jest.fn(), summary: jest.fn()};

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({goBack: jest.fn(), navigate: jest.fn()})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'user-1'}}}),
}));
jest.mock('../api/chefReviewsApi', () => ({
  chefReviewsApi: {
    list: (...args: unknown[]) => mockApi.list(...args),
    summary: (...args: unknown[]) => mockApi.summary(...args),
  },
}));

const KITCHEN_ID = '55555555-5555-4555-8555-555555555555';
const review = (n: number, overallRating: number, extra: Partial<PublicKitchenReview> = {}): PublicKitchenReview => ({
  reviewId: `66666666-6666-4666-8666-6666666666${String(n).padStart(2, '0')}`,
  kitchenId: KITCHEN_ID,
  overallRating,
  foodTasteRating: null,
  portionValueRating: null,
  packagingRating: null,
  accuracyRating: null,
  chefPreparationRating: null,
  deliveryRating: null,
  reviewText: `Review text ${n}`,
  tagCodes: [],
  mediaAssetIds: [],
  helpfulCount: 0,
  publishedAt: '2026-10-12T10:00:00Z',
  ...extra,
});
const SUMMARY = {kitchenId: KITCHEN_ID, reviewCount: 4, overallAverage: 4.5};
const REVIEWS = [
  review(1, 5, {tagCodes: ['TASTY', 'GOOD_PORTION']}),
  review(2, 5),
  review(3, 4),
  review(4, 3, {reviewText: null}),
];

let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

async function mount() {
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
        <ChefToastProvider>
          <ChefReviewsScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  await ui.settle();
  await ui.settle(); // the summary is asked for once the list has answered
}

describe('ChefReviewsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.list.mockResolvedValue({items: REVIEWS, nextCursor: null, hasMore: false});
    mockApi.summary.mockResolvedValue(SUMMARY);
  });
  afterEach(() => act(() => tree.unmount()));

  it('shows the average, the review count and each review with its words and tags', async () => {
    await mount();
    expect(mockApi.summary).toHaveBeenCalledWith(KITCHEN_ID, expect.anything());
    expect(ui.has('4.5')).toBe(true);
    expect(ui.has('4 reviews')).toBe(true);
    expect(ui.has('Review text 1')).toBe(true);
    expect(ui.has('Tasty')).toBe(true);
    expect(ui.has('Good portion')).toBe(true);
    expect(ui.anyText(/TASTY|GOOD_PORTION/)).toBe(false);
  });

  it('filters by stars on the phone: All, 5★, 4★, and 3★ and below', async () => {
    await mount();
    expect([1, 2, 3].every(n => ui.has(`Review text ${n}`))).toBe(true);
    await ui.press('5★');
    expect(ui.has('Review text 1')).toBe(true);
    expect(ui.has('Review text 3')).toBe(false);
    await ui.press('4★');
    expect(ui.has('Review text 3')).toBe(true);
    expect(ui.has('Review text 1')).toBe(false);
    await ui.press('3★ and below');
    expect(ui.has('Review text 3')).toBe(false);
    expect(ui.has('No reviews in this group')).toBe(false);
    await ui.press('All');
    expect(ui.has('Review text 1')).toBe(true);
  });

  it('says so when no review matches the chosen filter', async () => {
    mockApi.list.mockResolvedValue({items: [review(1, 5)], nextCursor: null, hasMore: false});
    mockApi.summary.mockResolvedValue({...SUMMARY, reviewCount: 1, overallAverage: 5});
    await mount();
    await ui.press('3★ and below');
    expect(ui.has('No reviews in this group')).toBe(true);
  });

  it('says only the loaded reviews were checked, and offers Load more, when a filter matches none and more exist', async () => {
    mockApi.list
      .mockResolvedValueOnce({items: [review(1, 5)], nextCursor: 'next-1', hasMore: true})
      .mockResolvedValueOnce({items: [review(2, 2)], nextCursor: null, hasMore: false});
    await mount();
    await ui.press('3★ and below');
    expect(ui.has('No loaded reviews in this group')).toBe(true);
    expect(ui.has('No reviews in this group')).toBe(false);
    await ui.press('Load more');
    await ui.settle();
    expect(mockApi.list).toHaveBeenLastCalledWith(expect.objectContaining({cursor: 'next-1'}));
    expect(ui.has('Review text 2')).toBe(true);
    expect(ui.has('No loaded reviews in this group')).toBe(false);
  });

  it('loads older reviews on request', async () => {
    mockApi.list
      .mockResolvedValueOnce({items: [review(1, 5)], nextCursor: 'next-1', hasMore: true})
      .mockResolvedValueOnce({items: [review(2, 4)], nextCursor: null, hasMore: false});
    await mount();
    expect(ui.has('Review text 2')).toBe(false);
    await ui.press('Show more reviews');
    await ui.settle();
    expect(mockApi.list).toHaveBeenLastCalledWith(expect.objectContaining({cursor: 'next-1'}));
    expect(ui.has('Review text 2')).toBe(true);
    expect(ui.byLabel('Show more reviews')).toBeUndefined();
  });

  it('shows an empty state with no star summary for a kitchen with no reviews', async () => {
    mockApi.list.mockResolvedValue({items: [], nextCursor: null, hasMore: false});
    await mount();
    expect(ui.has('No reviews yet')).toBe(true);
    expect(mockApi.summary).not.toHaveBeenCalled();
  });

  it('shows Coming soon, not an error, when the reviews route is not published', async () => {
    mockApi.list.mockRejectedValue(new AppApiError('HTTP_403', 'Forbidden', 403));
    await mount();
    expect(ui.has('Reviews are on their way')).toBe(true);
    expect(ui.anyText(/unavailable|failed|try again|route|gateway/i)).toBe(false);
  });
});
