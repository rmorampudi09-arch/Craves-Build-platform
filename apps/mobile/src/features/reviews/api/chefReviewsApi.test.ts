import {httpClient} from '../../../core/http/httpClient';
import {chefReviewsApi} from './chefReviewsApi';

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

describe('chefReviewsApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the exact Chef review route with bounded paging', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      items: [review],
      nextCursor: null,
      hasMore: false,
    });

    await expect(
      chefReviewsApi.list({limit: 3}),
    ).resolves.toEqual({
      items: [review],
      nextCursor: null,
      hasMore: false,
    });

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/chef/reviews', {
      signal: undefined,
      params: {limit: 3},
      dedupeKey: 'chef-reviews:all:3:',
    });
  });

  it('passes an owned kitchen filter and rejects mismatched response rows', async () => {
    (httpClient.get as jest.Mock).mockResolvedValueOnce({
      items: [review],
      nextCursor: null,
      hasMore: false,
    });

    await expect(
      chefReviewsApi.list({kitchenId, limit: 10}),
    ).resolves.toEqual({
      items: [review],
      nextCursor: null,
      hasMore: false,
    });

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/chef/reviews', {
      signal: undefined,
      params: {limit: 10, kitchenId},
      dedupeKey: `chef-reviews:${kitchenId}:10:`,
    });

    (httpClient.get as jest.Mock).mockResolvedValueOnce({
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
      chefReviewsApi.list({kitchenId}),
    ).rejects.toThrow('CHEF_REVIEWS_INVALID_RESPONSE');
  });

  it('reads the exact Chef kitchen review summary route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(summary);

    await expect(chefReviewsApi.summary(kitchenId)).resolves.toEqual(summary);

    expect(httpClient.get).toHaveBeenCalledWith(
      `/api/v1/chef/reviews/kitchens/${kitchenId}/summary`,
      {
        signal: undefined,
        dedupeKey: `chef-review-summary:${kitchenId}`,
      },
    );
  });

  it('rejects invalid ids and invalid limits before network calls', async () => {
    await expect(
      chefReviewsApi.summary('not-a-uuid'),
    ).rejects.toThrow('CHEF_REVIEWS_KITCHEN_ID_INVALID');

    await expect(
      chefReviewsApi.list({limit: 0}),
    ).rejects.toThrow('CHEF_REVIEWS_LIMIT_INVALID');

    await expect(
      chefReviewsApi.list({kitchenId: 'not-a-uuid'}),
    ).rejects.toThrow('CHEF_REVIEWS_KITCHEN_ID_INVALID');

    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it('reuses the privacy-safe public review parser and rejects leaked identity fields', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      items: [{...review, customerIdentityId: 'private'}],
      nextCursor: null,
      hasMore: false,
    });

    await expect(chefReviewsApi.list()).rejects.toThrow(
      'CHEF_REVIEWS_INVALID_RESPONSE',
    );
  });
});
