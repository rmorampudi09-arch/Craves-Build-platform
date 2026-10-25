import { NextRequest, NextResponse } from "next/server";
import { parseReferralCode, REFERRAL_NOT_ENROLLED } from "@/features/chef/lib/chef-referral-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/referrals/me/code");
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "REFERRAL_CODE_FAILED");
      // The code read finds no member row until the account has joined: the same answer as the other reads give.
      return mapped.status === 409 && mapped.code === "SOURCE_DEPENDENCY_MISSING" ? failure(403, REFERRAL_NOT_ENROLLED) : failure(mapped.status, mapped.code);
    }
    const code = parseReferralCode(body);
    return code ? NextResponse.json(code, { headers }) : failure(502, "INVALID_REFERRAL_CODE_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "REFERRAL_CODE_UNAVAILABLE");
  }
}
