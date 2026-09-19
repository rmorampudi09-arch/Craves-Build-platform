import {httpClient} from '../../../core/http/httpClient';
import {
  buildCustomerReviewSubmission,
  customerReviewsApi,
  parseCustomerReview,
  parseCustomerReviewPage,
  parseReviewTagDefinition,
} from './customerReviewsApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const orderId = '11111111-1111-4111-8111-111111111111';
const reviewId = '22222222-2222-4222-8222-222222222222';
const kitchenId = '33333333-3333-4333-8333-333333333333';

const review = {
  reviewId,
  orderId,
  kitchenId,
  status: 'PENDING_MODERATION',
  version: 1,
  overallRating: 5,
  foodTasteRating: null,
  portionValueRating: null,
  packagingRating: null,
  accuracyRating: null,
  chefPreparationRating: null,
  deliveryRating: null,
  reviewText: 'Great meal',
  tagCodes: ['FRESH'],
  mediaAssetIds: [],
  helpfulCount: 0,
  submittedAt: '2026-09-19T12:00:00Z',
  updatedAt: '2026-09-19T12:00:00Z',
  publishedAt: null,
};

describe('customerReviewsApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts only the exact owned-review JSON and rejects leaked fields', () => {
    expect(parseCustomerReview(review)).toEqual(review);
    expect(
      parseCustomerReview({...review, customerPhone: '+919999999999'}),
    ).toBeNull();
    expect(
      parseCustomerReview({...review, overallRating: 6}),
    ).toBeNull();
  });

  it('enforces publication timestamp consistency', () => {
    expect(
      parseCustomerReview({
        ...review,
        status: 'PUBLISHED',
        publishedAt: '2026-09-19T12:05:00Z',
      }),
    ).not.toBeNull();
    expect(
      parseCustomerReview({
        ...review,
        status: 'PUBLISHED',
        publishedAt: null,
      }),
    ).toBeNull();
  });

  it('builds the exact backend submission JSON and never sends media', () => {
    expect(
      buildCustomerReviewSubmission({
        overallRating: 5,
        reviewText: '  Great meal  ',
        tagCodes: [' fresh '],
      }),
    ).toEqual({
      expectedVersion: null,
      overallRating: 5,
      foodTasteRating: null,
      portionValueRating: null,
      packagingRating: null,
      accuracyRating: null,
      chefPreparationRating: null,
      deliveryRating: null,
      reviewText: 'Great meal',
      tagCodes: ['FRESH'],
      mediaAssetIds: [],
    });
  });

  it('rejects invalid ratings, oversized text, duplicate tags and bad versions', () => {
    expect(() =>
      buildCustomerReviewSubmission({overallRating: 0}),
    ).toThrow('CUSTOMER_REVIEW_RATING_INVALID');

    expect(() =>
      buildCustomerReviewSubmission({
        overallRating: 5,
        reviewText: 'x'.repeat(2001),
      }),
    ).toThrow('CUSTOMER_REVIEW_TEXT_TOO_LONG');

    expect(() =>
      buildCustomerReviewSubmission({
        overallRating: 5,
        tagCodes: ['FRESH', 'fresh'],
      }),
    ).toThrow('CUSTOMER_REVIEW_TAGS_INVALID');

    expect(() =>
      buildCustomerReviewSubmission({
        expectedVersion: 0,
        overallRating: 5,
      }),
    ).toThrow('CUSTOMER_REVIEW_VERSION_INVALID');
  });

  it('parses only exact active tag definitions', () => {
    const tag = {
      code: 'FRESH',
      displayLabel: 'Fresh',
      dimension: 'FOOD_TASTE',
      active: true,
      sortOrder: 10,
      updatedAt: '2026-09-19T12:00:00Z',
    };
    expect(parseReviewTagDefinition(tag)).toEqual(tag);
    expect(parseReviewTagDefinition({...tag, internalId: 5})).toBeNull();
  });

  it('parses cursor pages without accepting extra page fields', () => {
    const page = {
      items: [review],
      nextCursor: null,
      hasMore: false,
    };
    expect(parseCustomerReviewPage(page)).toEqual(page);
    expect(parseCustomerReviewPage({...page, total: 1})).toBeNull();
  });

  it('posts exact create JSON to the owned-order review route', async () => {
    (httpClient.post as jest.Mock).mockResolvedValue(review);

    await expect(
      customerReviewsApi.create(orderId, {
        overallRating: 5,
        foodTasteRating: null,
        portionValueRating: null,
        packagingRating: null,
        accuracyRating: null,
        chefPreparationRating: null,
        deliveryRating: null,
        reviewText: 'Great meal',
        tagCodes: ['FRESH'],
      }),
    ).resolves.toEqual(review);

    expect(httpClient.post).toHaveBeenCalledWith(
      `/api/v1/orders/${orderId}/review`,
      {
        expectedVersion: null,
        overallRating: 5,
        foodTasteRating: null,
        portionValueRating: null,
        packagingRating: null,
        accuracyRating: null,
        chefPreparationRating: null,
        deliveryRating: null,
        reviewText: 'Great meal',
        tagCodes: ['FRESH'],
        mediaAssetIds: [],
      },
      {signal: undefined},
    );
  });

  it('requires expectedVersion on update and sends it unchanged', async () => {
    (httpClient.put as jest.Mock).mockResolvedValue({
      ...review,
      version: 2,
      reviewText: 'Updated meal',
    });

    await expect(
      customerReviewsApi.update(orderId, {
        expectedVersion: 1,
        overallRating: 5,
        foodTasteRating: null,
        portionValueRating: null,
        packagingRating: null,
        accuracyRating: null,
        chefPreparationRating: null,
        deliveryRating: null,
        reviewText: 'Updated meal',
        tagCodes: ['FRESH'],
      }),
    ).resolves.toMatchObject({version: 2, reviewText: 'Updated meal'});

    expect(httpClient.put).toHaveBeenCalledWith(
      `/api/v1/orders/${orderId}/review`,
      expect.objectContaining({
        expectedVersion: 1,
        mediaAssetIds: [],
      }),
      {signal: undefined},
    );

    await expect(
      customerReviewsApi.update(orderId, {
        expectedVersion: null,
        overallRating: 5,
        foodTasteRating: null,
        portionValueRating: null,
        packagingRating: null,
        accuracyRating: null,
        chefPreparationRating: null,
        deliveryRating: null,
        reviewText: null,
        tagCodes: [],
      }),
    ).rejects.toThrow('CUSTOMER_REVIEW_VERSION_REQUIRED');
  });

  it('reads owned review and active tags from exact published routes', async () => {
    (httpClient.get as jest.Mock)
      .mockResolvedValueOnce(review)
      .mockResolvedValueOnce([
        {
          code: 'FRESH',
          displayLabel: 'Fresh',
          dimension: 'FOOD_TASTE',
          active: true,
          sortOrder: 2,
          updatedAt: '2026-09-19T12:00:00Z',
        },
        {
          code: 'OLD',
          displayLabel: 'Old tag',
          dimension: 'OVERALL',
          active: false,
          sortOrder: 1,
          updatedAt: '2026-09-19T12:00:00Z',
        },
      ]);

    await expect(customerReviewsApi.getForOrder(orderId)).resolves.toEqual(review);
    await expect(customerReviewsApi.listTags()).resolves.toHaveLength(1);

    expect(httpClient.get).toHaveBeenNthCalledWith(
      1,
      `/api/v1/orders/${orderId}/review`,
      {
        signal: undefined,
        dedupeKey: `customer-review:${orderId}`,
      },
    );
    expect(httpClient.get).toHaveBeenNthCalledWith(
      2,
      '/api/v1/reviews/tags',
      {
        signal: undefined,
        dedupeKey: 'customer-review-tags',
      },
    );
  });
});
