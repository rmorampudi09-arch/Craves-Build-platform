import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TAG_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;

// Backend source exists, but customer review APIM publication is not present on main yet.
// Keep the route/UI fail-closed until the gateway contract is published.
export const CUSTOMER_REVIEWS_AVAILABLE = false;
const REVIEW_STATUSES = [
  'PENDING_MODERATION',
  'PUBLISHED',
  'HIDDEN',
  'REJECTED',
] as const;
const RATING_DIMENSIONS = [
  'OVERALL',
  'FOOD_TASTE',
  'PORTION_VALUE',
  'PACKAGING',
  'ACCURACY',
  'CHEF_PREPARATION',
  'DELIVERY',
] as const;

export type CustomerReviewStatus = (typeof REVIEW_STATUSES)[number];
export type ReviewRatingDimension = (typeof RATING_DIMENSIONS)[number];

export interface CustomerReviewSubmission {
  expectedVersion: number | null;
  overallRating: number;
  foodTasteRating: number | null;
  portionValueRating: number | null;
  packagingRating: number | null;
  accuracyRating: number | null;
  chefPreparationRating: number | null;
  deliveryRating: number | null;
  reviewText: string | null;
  tagCodes: string[];
  mediaAssetIds: string[];
}

export interface CustomerReview {
  reviewId: string;
  orderId: string;
  kitchenId: string;
  status: CustomerReviewStatus;
  version: number;
  overallRating: number;
  foodTasteRating: number | null;
  portionValueRating: number | null;
  packagingRating: number | null;
  accuracyRating: number | null;
  chefPreparationRating: number | null;
  deliveryRating: number | null;
  reviewText: string | null;
  tagCodes: string[];
  mediaAssetIds: string[];
  helpfulCount: number;
  submittedAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface ReviewTagDefinition {
  code: string;
  displayLabel: string;
  dimension: ReviewRatingDimension;
  active: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface CustomerReviewPage {
  items: CustomerReview[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface HelpfulResponse {
  reviewId: string;
  helpfulByCaller: boolean;
  helpfulCount: number;
}

export interface ReviewReportRequest {
  reasonCode: string;
  detail: string | null;
}

export interface ReviewReport {
  reportId: string;
  reviewId: string;
  reasonCode: string;
  detail: string | null;
  createdAt: string;
}

const REVIEW_KEYS = new Set([
  'reviewId',
  'orderId',
  'kitchenId',
  'status',
  'version',
  'overallRating',
  'foodTasteRating',
  'portionValueRating',
  'packagingRating',
  'accuracyRating',
  'chefPreparationRating',
  'deliveryRating',
  'reviewText',
  'tagCodes',
  'mediaAssetIds',
  'helpfulCount',
  'submittedAt',
  'updatedAt',
  'publishedAt',
]);
const TAG_KEYS = new Set([
  'code',
  'displayLabel',
  'dimension',
  'active',
  'sortOrder',
  'updatedAt',
]);
const PAGE_KEYS = new Set(['items', 'nextCursor', 'hasMore']);
const HELPFUL_KEYS = new Set([
  'reviewId',
  'helpfulByCaller',
  'helpfulCount',
]);
const REPORT_KEYS = new Set([
  'reportId',
  'reviewId',
  'reasonCode',
  'detail',
  'createdAt',
]);
const STATUS_SET = new Set<CustomerReviewStatus>(REVIEW_STATUSES);
const DIMENSION_SET = new Set<ReviewRatingDimension>(RATING_DIMENSIONS);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function instant(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function nullableInstant(value: unknown): string | null | undefined {
  if (value == null) return null;
  return instant(value) ?? undefined;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1
    ? value
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function rating(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 5
    ? value
    : null;
}

function nullableRating(value: unknown): number | null | undefined {
  if (value == null) return null;
  return rating(value) ?? undefined;
}

function nullableText(
  value: unknown,
  maximum: number,
): string | null | undefined {
  if (value == null) return null;
  return typeof value === 'string' && value.length <= maximum
    ? value
    : undefined;
}

function parseTagCodes(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > 10 ||
    value.some(
      code =>
        typeof code !== 'string' ||
        !TAG_CODE_PATTERN.test(code) ||
        code !== code.toUpperCase(),
    )
  ) {
    return null;
  }
  if (new Set(value).size !== value.length) return null;
  return [...value] as string[];
}

function parseMediaAssetIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 5) return null;
  const ids = value.map(uuid);
  if (ids.some(id => id === null)) return null;
  const normalized = ids as string[];
  return new Set(normalized).size === normalized.length ? normalized : null;
}

export function parseCustomerReview(value: unknown): CustomerReview | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, REVIEW_KEYS)) return null;

  const reviewId = uuid(raw.reviewId);
  const orderId = uuid(raw.orderId);
  const kitchenId = uuid(raw.kitchenId);
  const status =
    typeof raw.status === 'string' &&
    STATUS_SET.has(raw.status as CustomerReviewStatus)
      ? (raw.status as CustomerReviewStatus)
      : null;
  const version = positiveInteger(raw.version);
  const overallRating = rating(raw.overallRating);
  const foodTasteRating = nullableRating(raw.foodTasteRating);
  const portionValueRating = nullableRating(raw.portionValueRating);
  const packagingRating = nullableRating(raw.packagingRating);
  const accuracyRating = nullableRating(raw.accuracyRating);
  const chefPreparationRating = nullableRating(raw.chefPreparationRating);
  const deliveryRating = nullableRating(raw.deliveryRating);
  const reviewText = nullableText(raw.reviewText, 2000);
  const tagCodes = parseTagCodes(raw.tagCodes);
  const mediaAssetIds = parseMediaAssetIds(raw.mediaAssetIds);
  const helpfulCount = nonNegativeInteger(raw.helpfulCount);
  const submittedAt = instant(raw.submittedAt);
  const updatedAt = instant(raw.updatedAt);
  const publishedAt = nullableInstant(raw.publishedAt);

  if (
    !reviewId ||
    !orderId ||
    !kitchenId ||
    !status ||
    !version ||
    !overallRating ||
    foodTasteRating === undefined ||
    portionValueRating === undefined ||
    packagingRating === undefined ||
    accuracyRating === undefined ||
    chefPreparationRating === undefined ||
    deliveryRating === undefined ||
    reviewText === undefined ||
    !tagCodes ||
    !mediaAssetIds ||
    helpfulCount === null ||
    !submittedAt ||
    !updatedAt ||
    publishedAt === undefined
  ) {
    return null;
  }

  if (status === 'PUBLISHED' && publishedAt === null) return null;
  if (status !== 'PUBLISHED' && publishedAt !== null) return null;

  return {
    reviewId,
    orderId,
    kitchenId,
    status,
    version,
    overallRating,
    foodTasteRating,
    portionValueRating,
    packagingRating,
    accuracyRating,
    chefPreparationRating,
    deliveryRating,
    reviewText,
    tagCodes,
    mediaAssetIds,
    helpfulCount,
    submittedAt,
    updatedAt,
    publishedAt,
  };
}

export function parseReviewTagDefinition(
  value: unknown,
): ReviewTagDefinition | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, TAG_KEYS)) return null;

  const code =
    typeof raw.code === 'string' &&
    TAG_CODE_PATTERN.test(raw.code) &&
    raw.code === raw.code.toUpperCase()
      ? raw.code
      : null;
  const displayLabel =
    typeof raw.displayLabel === 'string' &&
    raw.displayLabel.trim().length >= 1 &&
    raw.displayLabel.length <= 100
      ? raw.displayLabel
      : null;
  const dimension =
    typeof raw.dimension === 'string' &&
    DIMENSION_SET.has(raw.dimension as ReviewRatingDimension)
      ? (raw.dimension as ReviewRatingDimension)
      : null;
  const sortOrder =
    typeof raw.sortOrder === 'number' &&
    Number.isSafeInteger(raw.sortOrder) &&
    raw.sortOrder >= -100000 &&
    raw.sortOrder <= 100000
      ? raw.sortOrder
      : null;
  const updatedAt = instant(raw.updatedAt);

  if (
    !code ||
    !displayLabel ||
    !dimension ||
    typeof raw.active !== 'boolean' ||
    sortOrder === null ||
    !updatedAt
  ) {
    return null;
  }

  return {
    code,
    displayLabel,
    dimension,
    active: raw.active,
    sortOrder,
    updatedAt,
  };
}

export function parseCustomerReviewPage(value: unknown): CustomerReviewPage | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, PAGE_KEYS) || !Array.isArray(raw.items)) {
    return null;
  }

  const items = raw.items.map(parseCustomerReview);
  const nextCursor =
    raw.nextCursor == null
      ? null
      : typeof raw.nextCursor === 'string' &&
          raw.nextCursor.length >= 1 &&
          raw.nextCursor.length <= 1024
        ? raw.nextCursor
        : undefined;

  if (
    items.some(item => item === null) ||
    nextCursor === undefined ||
    typeof raw.hasMore !== 'boolean' ||
    (raw.hasMore && nextCursor === null)
  ) {
    return null;
  }

  return {
    items: items as CustomerReview[],
    nextCursor,
    hasMore: raw.hasMore,
  };
}

function parseHelpfulResponse(value: unknown): HelpfulResponse | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, HELPFUL_KEYS)) return null;
  const reviewId = uuid(raw.reviewId);
  const helpfulCount = nonNegativeInteger(raw.helpfulCount);
  if (
    !reviewId ||
    typeof raw.helpfulByCaller !== 'boolean' ||
    helpfulCount === null
  ) {
    return null;
  }
  return {reviewId, helpfulByCaller: raw.helpfulByCaller, helpfulCount};
}

function parseReviewReport(value: unknown): ReviewReport | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, REPORT_KEYS)) return null;
  const reportId = uuid(raw.reportId);
  const reviewId = uuid(raw.reviewId);
  const reasonCode =
    typeof raw.reasonCode === 'string' &&
    TAG_CODE_PATTERN.test(raw.reasonCode) &&
    raw.reasonCode === raw.reasonCode.toUpperCase()
      ? raw.reasonCode
      : null;
  const detail = nullableText(raw.detail, 1000);
  const createdAt = instant(raw.createdAt);
  if (!reportId || !reviewId || !reasonCode || detail === undefined || !createdAt) {
    return null;
  }
  return {reportId, reviewId, reasonCode, detail, createdAt};
}

function requireUuid(value: string, code: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error(code);
  return value;
}

function requireReview(value: unknown, orderId: string): CustomerReview {
  const parsed = parseCustomerReview(value);
  if (!parsed || parsed.orderId !== orderId) {
    throw new Error('CUSTOMER_REVIEW_INVALID_RESPONSE');
  }
  return parsed;
}

function normalizeOptionalRating(value: number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = rating(value);
  if (!parsed) throw new Error('CUSTOMER_REVIEW_RATING_INVALID');
  return parsed;
}

function normalizeTags(value: readonly string[] | undefined): string[] {
  const tags = (value ?? []).map(code => code.trim().toUpperCase());
  if (
    tags.length > 10 ||
    tags.some(code => !TAG_CODE_PATTERN.test(code)) ||
    new Set(tags).size !== tags.length
  ) {
    throw new Error('CUSTOMER_REVIEW_TAGS_INVALID');
  }
  return tags;
}

export function buildCustomerReviewSubmission(input: {
  expectedVersion?: number | null;
  overallRating: number;
  foodTasteRating?: number | null;
  portionValueRating?: number | null;
  packagingRating?: number | null;
  accuracyRating?: number | null;
  chefPreparationRating?: number | null;
  deliveryRating?: number | null;
  reviewText?: string | null;
  tagCodes?: readonly string[];
}): CustomerReviewSubmission {
  const overallRating = rating(input.overallRating);
  if (!overallRating) throw new Error('CUSTOMER_REVIEW_RATING_INVALID');

  const reviewText = input.reviewText?.trim() || null;
  if (reviewText && reviewText.length > 2000) {
    throw new Error('CUSTOMER_REVIEW_TEXT_TOO_LONG');
  }

  const expectedVersion =
    input.expectedVersion == null
      ? null
      : positiveInteger(input.expectedVersion);
  if (input.expectedVersion != null && expectedVersion === null) {
    throw new Error('CUSTOMER_REVIEW_VERSION_INVALID');
  }

  return {
    expectedVersion,
    overallRating,
    foodTasteRating: normalizeOptionalRating(input.foodTasteRating),
    portionValueRating: normalizeOptionalRating(input.portionValueRating),
    packagingRating: normalizeOptionalRating(input.packagingRating),
    accuracyRating: normalizeOptionalRating(input.accuracyRating),
    chefPreparationRating: normalizeOptionalRating(input.chefPreparationRating),
    deliveryRating: normalizeOptionalRating(input.deliveryRating),
    reviewText,
    tagCodes: normalizeTags(input.tagCodes),
    // Backend media authorization is fail-closed today. Do not send device media.
    mediaAssetIds: [],
  };
}

function reviewRoute(orderId: string): string {
  requireUuid(orderId, 'CUSTOMER_REVIEW_ORDER_ID_INVALID');
  return `/api/v1/orders/${orderId}/review`;
}

function reviewIdRoute(reviewId: string): string {
  requireUuid(reviewId, 'CUSTOMER_REVIEW_ID_INVALID');
  return `/api/v1/reviews/${reviewId}`;
}

function normalizeLimit(limit: number | undefined): number {
  const resolved = limit ?? 20;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 50) {
    throw new Error('CUSTOMER_REVIEW_LIMIT_INVALID');
  }
  return resolved;
}

export const customerReviewsApi = {
  async getForOrder(orderId: string, signal?: AbortSignal): Promise<CustomerReview> {
    const route = reviewRoute(orderId);
    return requireReview(
      await httpClient.get<unknown>(route, {
        signal,
        dedupeKey: `customer-review:${orderId}`,
      }),
      orderId,
    );
  },

  async create(
    orderId: string,
    input: Omit<CustomerReviewSubmission, 'expectedVersion' | 'mediaAssetIds'> & {
      expectedVersion?: null;
      mediaAssetIds?: never;
    },
    signal?: AbortSignal,
  ): Promise<CustomerReview> {
    const route = reviewRoute(orderId);
    const body = buildCustomerReviewSubmission({...input, expectedVersion: null});
    return requireReview(await httpClient.post<unknown>(route, body, {signal}), orderId);
  },

  async update(
    orderId: string,
    input: Omit<CustomerReviewSubmission, 'mediaAssetIds'> & {mediaAssetIds?: never},
    signal?: AbortSignal,
  ): Promise<CustomerReview> {
    const route = reviewRoute(orderId);
    const body = buildCustomerReviewSubmission(input);
    if (body.expectedVersion === null) {
      throw new Error('CUSTOMER_REVIEW_VERSION_REQUIRED');
    }
    return requireReview(await httpClient.put<unknown>(route, body, {signal}), orderId);
  },

  async listMine(options?: {
    limit?: number;
    cursor?: string | null;
    signal?: AbortSignal;
  }): Promise<CustomerReviewPage> {
    const limit = normalizeLimit(options?.limit);
    const params: Record<string, string | number> = {limit};
    if (options?.cursor) params.cursor = options.cursor;

    const value = await httpClient.get<unknown>('/api/v1/reviews/mine', {
      signal: options?.signal,
      params,
      dedupeKey: `customer-reviews-mine:${limit}:${options?.cursor ?? ''}`,
    });
    const parsed = parseCustomerReviewPage(value);
    if (!parsed) throw new Error('CUSTOMER_REVIEWS_PAGE_INVALID_RESPONSE');
    return parsed;
  },

  async listTags(signal?: AbortSignal): Promise<ReviewTagDefinition[]> {
    const value = await httpClient.get<unknown>('/api/v1/reviews/tags', {
      signal,
      dedupeKey: 'customer-review-tags',
    });
    if (!Array.isArray(value)) {
      throw new Error('CUSTOMER_REVIEW_TAGS_INVALID_RESPONSE');
    }
    const tags = value.map(parseReviewTagDefinition);
    if (tags.some(tag => tag === null)) {
      throw new Error('CUSTOMER_REVIEW_TAGS_INVALID_RESPONSE');
    }
    return (tags as ReviewTagDefinition[])
      .filter(tag => tag.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  },

  async markHelpful(reviewId: string, signal?: AbortSignal): Promise<HelpfulResponse> {
    const value = await httpClient.put<unknown>(
      `${reviewIdRoute(reviewId)}/helpful`,
      undefined,
      {signal},
    );
    const parsed = parseHelpfulResponse(value);
    if (!parsed || parsed.reviewId !== reviewId) {
      throw new Error('CUSTOMER_REVIEW_HELPFUL_INVALID_RESPONSE');
    }
    return parsed;
  },

  async removeHelpful(reviewId: string, signal?: AbortSignal): Promise<HelpfulResponse> {
    const value = await httpClient.delete<unknown>(
      `${reviewIdRoute(reviewId)}/helpful`,
      {signal},
    );
    const parsed = parseHelpfulResponse(value);
    if (!parsed || parsed.reviewId !== reviewId) {
      throw new Error('CUSTOMER_REVIEW_HELPFUL_INVALID_RESPONSE');
    }
    return parsed;
  },

  async report(
    reviewId: string,
    request: ReviewReportRequest,
    signal?: AbortSignal,
  ): Promise<ReviewReport> {
    const reasonCode = request.reasonCode.trim().toUpperCase();
    if (!TAG_CODE_PATTERN.test(reasonCode)) {
      throw new Error('CUSTOMER_REVIEW_REPORT_REASON_INVALID');
    }
    const detail = request.detail?.trim() || null;
    if (detail && detail.length > 1000) {
      throw new Error('CUSTOMER_REVIEW_REPORT_DETAIL_TOO_LONG');
    }
    const value = await httpClient.post<unknown>(
      `${reviewIdRoute(reviewId)}/reports`,
      {reasonCode, detail},
      {signal},
    );
    const parsed = parseReviewReport(value);
    if (!parsed || parsed.reviewId !== reviewId) {
      throw new Error('CUSTOMER_REVIEW_REPORT_INVALID_RESPONSE');
    }
    return parsed;
  },
};
