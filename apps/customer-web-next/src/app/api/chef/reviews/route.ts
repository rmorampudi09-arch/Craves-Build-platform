import { NextRequest, NextResponse } from "next/server";
import { isReviewUuid, parseChefReviewPage, REVIEW_CURSOR } from "@/features/chef/lib/chef-review-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const failure = (status: number, code: string) => NextResponse.json({ code }, { status, headers });

/** A page of the chef's published reviews, newest first. A gateway without the route answers FEATURE_NOT_AVAILABLE. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = params.get("limit") ?? "20", cursor = params.get("cursor"), kitchenId = params.get("kitchenId");
  if (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50 || (cursor !== null && !REVIEW_CURSOR.test(cursor)) || (kitchenId !== null && !isReviewUuid(kitchenId))) {
    return failure(400, "INVALID_CHEF_REVIEWS_QUERY");
  }
  const query = new URLSearchParams({ limit: String(Number(limit)) });
  if (kitchenId) query.set("kitchenId", kitchenId);
  if (cursor) query.set("cursor", cursor);
  try {
    const upstream = await authenticatedApiFetch(request, `/chef/reviews?${query}`);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "CHEF_REVIEWS_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const page = parseChefReviewPage(body);
    // A kitchen asked for must be the only one answered.
    return page && (!kitchenId || page.items.every((review) => review.kitchenId === kitchenId))
      ? NextResponse.json(page, { headers })
      : failure(502, "INVALID_CHEF_REVIEWS_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "CHEF_REVIEWS_UNAVAILABLE");
  }
}
