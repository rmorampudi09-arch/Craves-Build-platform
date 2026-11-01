import { NextRequest, NextResponse } from "next/server";
import { isReviewUuid, parseChefReviewSummary } from "@/features/chef/lib/chef-review-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const failure = (status: number, code: string) => NextResponse.json({ code }, { status, headers });

/** The kitchen's review count and average, as order-service works them out. */
export async function GET(request: NextRequest, context: { params: Promise<{ kitchenId: string }> }) {
  const { kitchenId } = await context.params;
  if (!isReviewUuid(kitchenId)) return failure(400, "INVALID_KITCHEN_ID");
  try {
    const upstream = await authenticatedApiFetch(request, `/chef/reviews/kitchens/${kitchenId}/summary`);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "CHEF_REVIEW_SUMMARY_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const summary = parseChefReviewSummary(body);
    return summary && summary.kitchenId.toLowerCase() === kitchenId.toLowerCase()
      ? NextResponse.json(summary, { headers })
      : failure(502, "INVALID_CHEF_REVIEW_SUMMARY_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "CHEF_REVIEW_SUMMARY_UNAVAILABLE");
  }
}
