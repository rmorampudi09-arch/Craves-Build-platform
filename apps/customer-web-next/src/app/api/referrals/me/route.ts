import { NextRequest, NextResponse } from "next/server";
import { parseReferralOverview } from "@/features/chef/lib/chef-referral-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

/** The referral overview, cut down to what the Joined, On hold and Earned tiles show. Not on the gateway yet: 404 FEATURE_NOT_AVAILABLE. */
export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/referrals/me");
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "REFERRAL_OVERVIEW_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const overview = parseReferralOverview(body);
    return overview
      ? NextResponse.json(overview, { headers })
      : failure(502, "INVALID_REFERRAL_OVERVIEW_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "SESSION_EXPIRED")
      : failure(503, "REFERRAL_OVERVIEW_UNAVAILABLE");
  }
}
