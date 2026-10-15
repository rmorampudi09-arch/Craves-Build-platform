import { NextRequest, NextResponse } from "next/server";
import { parseChefReferralEarnings } from "@/features/chef/lib/chef-referral-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/referrals/me/chef-earnings");
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "REFERRAL_EARNINGS_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const earnings = parseChefReferralEarnings(body);
    return earnings ? NextResponse.json(earnings, { headers }) : failure(502, "INVALID_REFERRAL_EARNINGS_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "REFERRAL_EARNINGS_UNAVAILABLE");
  }
}
