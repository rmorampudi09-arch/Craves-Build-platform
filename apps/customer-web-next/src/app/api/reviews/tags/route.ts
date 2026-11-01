import { NextRequest, NextResponse } from "next/server";
import { orderServiceError, parseReviewTags } from "@/features/orders/lib/review-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers: { "Cache-Control": "no-store" } });
}

/** The active review tags a customer can pick when rating an order. */
export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/reviews/tags");
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, orderServiceError(body), "REVIEW_TAGS_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const tags = parseReviewTags(body);
    return tags
      ? NextResponse.json(tags, { headers: { "Cache-Control": "no-store" } })
      : failure(502, "INVALID_REVIEW_TAGS_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "REVIEW_TAGS_UNAVAILABLE");
  }
}
