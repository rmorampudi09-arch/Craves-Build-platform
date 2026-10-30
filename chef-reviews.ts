import { sessionFetch } from "@/shared/lib/session-fetch";
import { parseChefReviewPage, parseChefReviewSummary, type ChefReviewPage, type ChefReviewSummary } from "@/features/chef/lib/chef-review-contract";

/** code is FEATURE_NOT_AVAILABLE (show Coming soon), SESSION_EXPIRED, a backend code, or CHEF_REVIEWS_FAILED. */
export class ChefReviewsError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

async function read<T>(path: string, parse: (value: unknown) => T | null): Promise<T> {
  const response = await sessionFetch(path, { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = response.status === 401 ? "SESSION_EXPIRED" : (body as { code?: unknown } | null)?.code;
    throw new ChefReviewsError(typeof code === "string" ? code : "CHEF_REVIEWS_FAILED", response.status);
  }
  const parsed = parse(body);
  if (!parsed) throw new ChefReviewsError("INVALID_CHEF_REVIEWS_RESPONSE", 502);
  return parsed;
}

/** One page of the chef's reviews, newest first; pass the previous page's nextCursor for older ones. */
export function fetchChefReviews(options: { limit?: number; cursor?: string | null } = {}): Promise<ChefReviewPage> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.cursor) query.set("cursor", options.cursor);
  return read(`/api/chef/reviews?${query}`, parseChefReviewPage);
}

export function fetchChefReviewSummary(kitchenId: string): Promise<ChefReviewSummary> {
  return read(`/api/chef/reviews/kitchens/${encodeURIComponent(kitchenId)}/summary`, parseChefReviewSummary);
}
