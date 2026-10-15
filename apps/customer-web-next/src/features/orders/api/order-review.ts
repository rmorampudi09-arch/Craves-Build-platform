import {
  DIMENSION_RATINGS,
  parseCustomerReview,
  parseReviewTags,
  type CustomerReview,
  type ReviewTag,
} from "@/features/orders/lib/review-contract";
import { sessionFetch } from "@/shared/lib/session-fetch";

/** `code` is the BFF's: FEATURE_NOT_AVAILABLE, ORDER_REVIEW_VERSION_CONFLICT, SESSION_EXPIRED, … */
export class OrderReviewError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.name = "OrderReviewError";
    this.code = code;
    this.status = status;
  }
}

export type ReviewDraft = { overallRating: number; reviewText: string; tagCodes: string[] };

const reviewPath = (orderId: string) => `/api/orders/${encodeURIComponent(orderId)}/review`;
const codeOf = (body: unknown) =>
  body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string"
    ? (body as { code: string }).code
    : "ORDER_REVIEW_FAILED";

async function readReview(response: Response): Promise<CustomerReview | null> {
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 404 && codeOf(body) === "ORDER_REVIEW_NOT_FOUND") return null;
  if (!response.ok) throw new OrderReviewError(codeOf(body), response.status);
  const review = parseCustomerReview(body);
  if (!review) throw new OrderReviewError("INVALID_ORDER_REVIEW_RESPONSE", 502);
  return review;
}

/** The customer's review of this order, or null before they rate it. */
export async function getOrderReview(orderId: string): Promise<CustomerReview | null> {
  return readReview(await sessionFetch(reviewPath(orderId), { cache: "no-store" }));
}

/** Creates the review, or updates `existing` at its version; ratings the web doesn't ask for go back unchanged. */
export async function saveOrderReview(
  orderId: string,
  draft: ReviewDraft,
  existing: CustomerReview | null,
): Promise<CustomerReview> {
  const response = await sessionFetch(reviewPath(orderId), {
    method: existing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(existing ? { expectedVersion: existing.version } : {}),
      overallRating: draft.overallRating,
      ...Object.fromEntries(DIMENSION_RATINGS.map((field) => [field, existing?.[field] ?? null])),
      reviewText: draft.reviewText.trim() || null,
      tagCodes: draft.tagCodes,
    }),
  });
  const review = await readReview(response);
  if (!review) throw new OrderReviewError("ORDER_REVIEW_FAILED", response.status);
  return review;
}

/** Tags are optional: none when the list isn't live yet or didn't load. */
export async function listReviewTags(): Promise<ReviewTag[]> {
  try {
    const response = await sessionFetch("/api/reviews/tags", { cache: "no-store" });
    return response.ok ? (parseReviewTags(await response.json()) ?? []) : [];
  } catch {
    return [];
  }
}
