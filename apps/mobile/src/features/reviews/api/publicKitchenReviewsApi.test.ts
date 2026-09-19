import {httpClient} from '../../../core/http/httpClient';
import {
  parsePublicKitchenReview,
  parsePublicKitchenReviewPage,
  parsePublicKitchenReviewSummary,
  publicKitchenReviewsApi,
} from './publicKitchenReviewsApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const kitchenId = '11111111-1111-4111-8111-111111111111';
const reviewId = '22222222-2222-4222-8222-222222222222';

const review = {
  reviewId,
  kitchenId,
  overallRating: 5,
  foodTasteRating: 5,
  portionValueRating: null,
  packagingRating: 4,
  accuracyRating: null,
  chefPreparationRating: 5,
  deliveryRating: 3,
  reviewText: 'Fresh and well packed.',
  tagCodes: ['FRESH'],
  mediaAssetIds: [],
  helpfulCount: 2,
  publishedAt: '2026-09-19T12:00:00Z',
};

const summary = {
  kitchenId,
  reviewCount: 4,
  overallAverage: 4.75,
  foodTasteAverage: 4.5,
  portionValueAverage: null,
  packagingAverage: 4.25,
  accuracyAverage: null,
  chefPreparationAverage: 5,
  deliveryAverage: 3.75,
};

describe('publicKitchenReviewsApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts only exact public review JSON without reviewer PII', () => {
    expect(parsePublicKitchenReview(review)).toEqual(review);
    expect(
      parsePublicKitchenReview({...review, customerIdentityId: 'private-id'}),
    ).toBeNull();
    expect(
      parsePublicKitchenReview({...review, deliveryAddress: 'private'}),
    ).toBeNull();
  });

  it('requires integer 1-5 review scores', () => {
    expect(
      parsePublicKitchenReview({...review, overallRating: 4.5}),
    ).toBeNull();
    expect(
      parsePublicKitchenReview({...review, deliveryRating: 0}),
    ).toBeNull();
  });

  it('accepts bounded decimal averages and nullable optional dimensions', () => {
    expect(parsePublicKitchenReviewSummary(summary)).toEqual(summary);
    expect(
      parsePublicKitchenReviewSummary({...summary, overallAverage: 5.1}),
    ).toBeNull();
  });

  it('requires zero-review summaries to have no overall average', () => {
    expect(
      parsePublicKitchenReviewSummary({
        ...summary,
        reviewCount: 0,
        overallAverage: null,
        foodTasteAverage: null,
        packagingAverage: null,
        chefPreparationAverage: null,
        deliveryAverage: null,
      }),
    ).not.toBeNull();

    expect(
      parsePublicKitchenReviewSummary({
        ...summary,
        reviewCount: 0,
        overallAverage: 4,
      }),
    ).toBeNull();
  });

  it('parses exact cursor pages only', () => {
    const page = {
      items: [review],
      nextCursor: 'cursor-1',
      hasMore: true,
    };
    expect(parsePublicKitchenReviewPage(page)).toEqual(page);
    expect(parsePublicKitchenReviewPage({...page, total: 100})).toBeNull();
    expect(
      parsePublicKitchenReviewPage({...page, nextCursor: null}),
    ).toBeNull();
  });

  it('reads the exact public review list route and validates kitchen ownership', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      items: [review],
      nextCursor: null,
      hasMore: false,
    });

    await expect(
      publicKitchenReviewsApi.list(kitchenId, {limit: 3}),
    ).resolves.toEqual({
      items: [review],
      nextCursor: null,
      hasMore: false,
    });

    expect(httpClient.get).toHaveBeenCalledWith(
      `/api/v1/public/kitchens/${kitchenId}/reviews`,
      {
        signal: undefined,
        params: {limit: 3},
        dedupeKey: `public-kitchen-reviews:${kitchenId}:3:`,
      },
    );

    (httpClient.get as jest.Mock).mockResolvedValue({
      items: [
        {
          ...review,
          kitchenId: '33333333-3333-4333-8333-333333333333',
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    await expect(
      publicKitchenReviewsApi.list(kitchenId),
    ).rejects.toThrow('PUBLIC_KITCHEN_REVIEWS_INVALID_RESPONSE');
  });

  it('reads the exact public summary route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(summary);

    await expect(
      publicKitchenReviewsApi.summary(kitchenId),
    ).resolves.toEqual(summary);

    expect(httpClient.get).toHaveBeenCalledWith(
      `/api/v1/public/kitchens/${kitchenId}/reviews/summary`,
      {
        signal: undefined,
        dedupeKey: `public-kitchen-review-summary:${kitchenId}`,
      },
    );
  });

  it('rejects invalid kitchen ids and limits before network calls', async () => {
    await expect(
      publicKitchenReviewsApi.summary('not-a-uuid'),
    ).rejects.toThrow('PUBLIC_KITCHEN_REVIEWS_KITCHEN_ID_INVALID');

    await expect(
      publicKitchenReviewsApi.list(kitchenId, {limit: 51}),
    ).rejects.toThrow('PUBLIC_KITCHEN_REVIEWS_LIMIT_INVALID');

    expect(httpClient.get).not.toHaveBeenCalled();
  });
});
