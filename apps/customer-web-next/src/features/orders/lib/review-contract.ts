// Mirrors order-service ReviewModels (CustomerReviewView, TagDefinitionView) and ReviewValidation's limits. Browser-safe.
export const REVIEW_TEXT_MAX = 2000;
export const REVIEW_TAGS_MAX = 10;
const MEDIA_MAX = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = ["PENDING_MODERATION", "PUBLISHED", "HIDDEN", "REJECTED"] as const;
/** The other dimensions: the web form rates overall only and sends these back unchanged. */
export const DIMENSION_RATINGS = [
  "foodTasteRating",
  "portionValueRating",
  "packagingRating",
  "accuracyRating",
  "chefPreparationRating",
  "deliveryRating",
] as const;

export type ReviewStatus = (typeof STATUSES)[number];
type DimensionRating = (typeof DIMENSION_RATINGS)[number];
export type CustomerReview = {
  reviewId: string;
  orderId: string;
  kitchenId: string;
  status: ReviewStatus;
  version: number;
  overallRating: number;
  reviewText: string | null;
  tagCodes: string[];
  mediaAssetIds: string[];
  submittedAt: string;
  updatedAt: string;
  publishedAt: string | null;
} & Record<DimensionRating, number | null>;
export type ReviewTag = { code: string; displayLabel: string; sortOrder: number };

/** Where the customer's review stands, in their words. */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  PUBLISHED: "Published",
  PENDING_MODERATION: "Submitted for review",
  HIDDEN: "Not currently public",
  REJECTED: "Not published",
};

export function isTagCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9_]{1,64}$/.test(value);
}

export function isRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const instant = (value: unknown): string | null =>
  typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value))
    ? value
    : null;

function distinct(value: unknown, max: number, valid: (item: unknown) => boolean): string[] | null {
  return Array.isArray(value) &&
    value.length <= max &&
    value.every(valid) &&
    new Set(value).size === value.length
    ? (value as string[])
    : null;
}

export function parseCustomerReview(value: unknown): CustomerReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const status = STATUSES.find((item) => item === raw.status);
  const dimensions = DIMENSION_RATINGS.map((field) =>
    raw[field] == null ? null : isRating(raw[field]) ? raw[field] : undefined,
  );
  const reviewText =
    raw.reviewText == null
      ? null
      : typeof raw.reviewText === "string" && raw.reviewText.length <= REVIEW_TEXT_MAX
        ? raw.reviewText
        : undefined;
  const publishedAt = raw.publishedAt == null ? null : (instant(raw.publishedAt) ?? undefined);
  const tagCodes = distinct(raw.tagCodes, REVIEW_TAGS_MAX, isTagCode);
  const mediaAssetIds = distinct(raw.mediaAssetIds, MEDIA_MAX, isUuid);
  const submittedAt = instant(raw.submittedAt);
  const updatedAt = instant(raw.updatedAt);
  const version =
    Number.isSafeInteger(raw.version) && (raw.version as number) >= 1
      ? (raw.version as number)
      : null;
  if (
    !isUuid(raw.reviewId) ||
    !isUuid(raw.orderId) ||
    !isUuid(raw.kitchenId) ||
    !status ||
    !version ||
    !isRating(raw.overallRating) ||
    dimensions.includes(undefined) ||
    reviewText === undefined ||
    publishedAt === undefined ||
    // Only a published review has a publish date.
    (status === "PUBLISHED") !== (publishedAt !== null) ||
    !tagCodes ||
    !mediaAssetIds ||
    !submittedAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    reviewId: raw.reviewId,
    orderId: raw.orderId,
    kitchenId: raw.kitchenId,
    status,
    version,
    overallRating: raw.overallRating,
    ...(Object.fromEntries(
      DIMENSION_RATINGS.map((field, index) => [field, dimensions[index]]),
    ) as Record<DimensionRating, number | null>),
    reviewText,
    tagCodes,
    mediaAssetIds,
    submittedAt,
    updatedAt,
    publishedAt,
  };
}

/** The active tags, in the order the admin set; null when the list breaks the contract. */
export function parseReviewTags(value: unknown): ReviewTag[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const tags: ReviewTag[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const raw = item as Record<string, unknown>;
    const label = typeof raw.displayLabel === "string" ? raw.displayLabel.trim() : "";
    if (
      !isTagCode(raw.code) ||
      !label ||
      label.length > 100 ||
      !Number.isSafeInteger(raw.sortOrder) ||
      Math.abs(raw.sortOrder as number) > 100_000 ||
      (raw.active !== undefined && typeof raw.active !== "boolean")
    ) {
      return null;
    }
    if (raw.active !== false)
      tags.push({ code: raw.code, displayLabel: label, sortOrder: raw.sortOrder as number });
  }
  return tags.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

/** Order-service names its error code in `error` (ApiErrorResponse); upstreamFailure reads `code`. */
export function orderServiceError(body: unknown): { code?: unknown } {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return { code: raw.error ?? raw.code };
}
