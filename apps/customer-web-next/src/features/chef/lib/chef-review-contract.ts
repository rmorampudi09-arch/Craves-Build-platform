// order-service ChefReviewController (GET /api/v1/chef/reviews, GET /api/v1/chef/reviews/kitchens/{id}/summary):
// published reviews of the signed-in chef's kitchens, newest first. Only the fields the chef screens show are kept.

export type ChefReview = {
  reviewId: string;
  kitchenId: string;
  /** 1 to 5 stars. */
  overallRating: number;
  reviewText: string | null;
  /** Admin-defined tags such as ON_TIME, shown as words. */
  tagCodes: string[];
  publishedAt: string;
};
export type ChefReviewPage = { items: ChefReview[]; nextCursor: string | null; hasMore: boolean };
/** overallAverage is null exactly when there are no reviews. */
export type ChefReviewSummary = { kitchenId: string; reviewCount: number; overallAverage: number | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG = /^[A-Z0-9_]{1,64}$/;
/** The order-service cursor: base64url, at most 256 characters. */
export const REVIEW_CURSOR = /^[A-Za-z0-9_-]{1,256}$/;

const record = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
export const isReviewUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

function parseReview(value: unknown): ChefReview | null {
  const raw = record(value);
  if (!raw) return null;
  const { reviewId, kitchenId, overallRating, reviewText, tagCodes, publishedAt } = raw;
  const text = reviewText == null || reviewText === "" ? null : typeof reviewText === "string" && reviewText.length <= 2000 ? reviewText.trim() || null : undefined;
  const tags = Array.isArray(tagCodes) && tagCodes.length <= 10 && tagCodes.every((code) => typeof code === "string" && TAG.test(code)) ? [...new Set(tagCodes as string[])] : null;
  if (
    !isReviewUuid(reviewId) || !isReviewUuid(kitchenId) || !Number.isInteger(overallRating) || (overallRating as number) < 1 || (overallRating as number) > 5 ||
    text === undefined || !tags || typeof publishedAt !== "string" || publishedAt.length > 40 || Number.isNaN(Date.parse(publishedAt))
  ) return null;
  return { reviewId, kitchenId, overallRating: overallRating as number, reviewText: text, tagCodes: tags, publishedAt };
}

export function parseChefReviewPage(value: unknown): ChefReviewPage | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.items) || raw.items.length > 50 || typeof raw.hasMore !== "boolean") return null;
  const items = raw.items.map(parseReview);
  const nextCursor = raw.nextCursor == null ? null : typeof raw.nextCursor === "string" && REVIEW_CURSOR.test(raw.nextCursor) ? raw.nextCursor : undefined;
  if (items.some((item) => !item) || nextCursor === undefined || (raw.hasMore && !nextCursor)) return null;
  return { items: items as ChefReview[], nextCursor, hasMore: raw.hasMore };
}

export function parseChefReviewSummary(value: unknown): ChefReviewSummary | null {
  const raw = record(value);
  if (!raw || !isReviewUuid(raw.kitchenId) || !Number.isSafeInteger(raw.reviewCount) || (raw.reviewCount as number) < 0) return null;
  // BigDecimal: a JSON number, or a decimal string if the server ever writes it so.
  const average = raw.overallAverage == null ? null : typeof raw.overallAverage === "number" || typeof raw.overallAverage === "string" ? Number(raw.overallAverage) : NaN;
  if (average !== null && !(Number.isFinite(average) && average >= 1 && average <= 5)) return null;
  // An average without reviews, or reviews without an average, is not a summary we can show.
  if ((raw.reviewCount === 0) !== (average === null)) return null;
  return { kitchenId: raw.kitchenId, reviewCount: raw.reviewCount as number, overallAverage: average };
}
