import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TAG_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;

// Order Service source exists, but public review APIM publication is not present on main yet.
// Keep customer-facing review reads hidden until the gateway contract is published.
export const PUBLIC_KITCHEN_REVIEWS_AVAILABLE = false;

export interface PublicKitchenReview {
  reviewId: string;
  kitchenId: string;
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
  publishedAt: string;
}

export interface PublicKitchenReviewPage {
  items: PublicKitchenReview[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PublicKitchenReviewSummary {
  kitchenId: string;
  reviewCount: number;
  overallAverage: number | null;
  foodTasteAverage: number | null;
  portionValueAverage: number | null;
  packagingAverage: number | null;
  accuracyAverage: number | null;
  chefPreparationAverage: number | null;
  deliveryAverage: number | null;
}

const REVIEW_KEYS = new Set([
  'reviewId',
  'kitchenId',
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
  'publishedAt',
]);

const PAGE_KEYS = new Set(['items', 'nextCursor', 'hasMore']);

const SUMMARY_KEYS = new Set([
  'kitchenId',
  'reviewCount',
  'overallAverage',
  'foodTasteAverage',
  'portionValueAverage',
  'packagingAverage',
  'accuracyAverage',
  'chefPreparationAverage',
  'deliveryAverage',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  raw: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(raw);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function rating(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 5
    ? value
    : null;
}

function average(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 5
    ? value
    : null;
}

function nullableRating(value: unknown): number | null | undefined {
  if (value == null) return null;
  return rating(value) ?? undefined;
}

function nullableAverage(value: unknown): number | null | undefined {
  if (value == null) return null;
  return average(value) ?? undefined;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function instant(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function nullableText(value: unknown, maximum: number): string | null | undefined {
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
  return new Set(value).size === value.length ? ([...value] as string[]) : null;
}

function parseMediaAssetIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 5) return null;
  const ids = value.map(uuid);
  if (ids.some(id => id === null)) return null;
  const normalized = ids as string[];
  return new Set(normalized).size === normalized.length ? normalized : null;
}

export function parsePublicKitchenReview(
  value: unknown,
): PublicKitchenReview | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, REVIEW_KEYS)) return null;

  const reviewId = uuid(raw.reviewId);
  const kitchenId = uuid(raw.kitchenId);
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
  const publishedAt = instant(raw.publishedAt);

  if (
    !reviewId ||
    !kitchenId ||
    overallRating === null ||
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
    !publishedAt
  ) {
    return null;
  }

  return {
    reviewId,
    kitchenId,
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
    publishedAt,
  };
}

export function parsePublicKitchenReviewPage(
  value: unknown,
): PublicKitchenReviewPage | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, PAGE_KEYS) || !Array.isArray(raw.items)) {
    return null;
  }

  const items = raw.items.map(parsePublicKitchenReview);
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
    items: items as PublicKitchenReview[],
    nextCursor,
    hasMore: raw.hasMore,
  };
}

export function parsePublicKitchenReviewSummary(
  value: unknown,
): PublicKitchenReviewSummary | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, SUMMARY_KEYS)) return null;

  const kitchenId = uuid(raw.kitchenId);
  const reviewCount = nonNegativeInteger(raw.reviewCount);
  const overallAverage = nullableAverage(raw.overallAverage);
  const foodTasteAverage = nullableAverage(raw.foodTasteAverage);
  const portionValueAverage = nullableAverage(raw.portionValueAverage);
  const packagingAverage = nullableAverage(raw.packagingAverage);
  const accuracyAverage = nullableAverage(raw.accuracyAverage);
  const chefPreparationAverage = nullableAverage(raw.chefPreparationAverage);
  const deliveryAverage = nullableAverage(raw.deliveryAverage);

  if (
    !kitchenId ||
    reviewCount === null ||
    overallAverage === undefined ||
    foodTasteAverage === undefined ||
    portionValueAverage === undefined ||
    packagingAverage === undefined ||
    accuracyAverage === undefined ||
    chefPreparationAverage === undefined ||
    deliveryAverage === undefined
  ) {
    return null;
  }

  if (reviewCount === 0 && overallAverage !== null) return null;
  if (reviewCount > 0 && overallAverage === null) return null;

  return {
    kitchenId,
    reviewCount,
    overallAverage,
    foodTasteAverage,
    portionValueAverage,
    packagingAverage,
    accuracyAverage,
    chefPreparationAverage,
    deliveryAverage,
  };
}

function requireKitchenId(kitchenId: string): string {
  if (!UUID_PATTERN.test(kitchenId)) {
    throw new Error('PUBLIC_KITCHEN_REVIEWS_KITCHEN_ID_INVALID');
  }
  return kitchenId;
}

function normalizeLimit(limit: number | undefined): number {
  const resolved = limit ?? 20;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 50) {
    throw new Error('PUBLIC_KITCHEN_REVIEWS_LIMIT_INVALID');
  }
  return resolved;
}

function route(kitchenId: string): string {
  requireKitchenId(kitchenId);
  return `/api/v1/public/kitchens/${kitchenId}/reviews`;
}

export const publicKitchenReviewsApi = {
  async list(
    kitchenId: string,
    options?: {
      limit?: number;
      cursor?: string | null;
      signal?: AbortSignal;
    },
  ): Promise<PublicKitchenReviewPage> {
    const baseRoute = route(kitchenId);
    const limit = normalizeLimit(options?.limit);
    const params: Record<string, string | number> = {limit};
    if (options?.cursor) params.cursor = options.cursor;

    const value = await httpClient.get<unknown>(baseRoute, {
      signal: options?.signal,
      params,
      dedupeKey: `public-kitchen-reviews:${kitchenId}:${limit}:${
        options?.cursor ?? ''
      }`,
    });
    const parsed = parsePublicKitchenReviewPage(value);
    if (
      !parsed ||
      parsed.items.some(review => review.kitchenId !== kitchenId)
    ) {
      throw new Error('PUBLIC_KITCHEN_REVIEWS_INVALID_RESPONSE');
    }
    return parsed;
  },

  async summary(
    kitchenId: string,
    signal?: AbortSignal,
  ): Promise<PublicKitchenReviewSummary> {
    const baseRoute = route(kitchenId);
    const value = await httpClient.get<unknown>(`${baseRoute}/summary`, {
      signal,
      dedupeKey: `public-kitchen-review-summary:${kitchenId}`,
    });
    const parsed = parsePublicKitchenReviewSummary(value);
    if (!parsed || parsed.kitchenId !== kitchenId) {
      throw new Error('PUBLIC_KITCHEN_REVIEW_SUMMARY_INVALID_RESPONSE');
    }
    return parsed;
  },
};
