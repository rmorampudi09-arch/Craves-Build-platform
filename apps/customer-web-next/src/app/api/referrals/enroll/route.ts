import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseReferralEnrollment } from "@/features/chef/lib/chef-referral-contract";
import { CHEF_REFERRAL_TERMS_VERSION } from "@/features/chef/lib/chef-referral-terms";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
// An existing account joins without a referrer, so no attribution token is ever sent.
const enrollRequest = z.object({ termsVersion: z.literal(CHEF_REFERRAL_TERMS_VERSION), termsAccepted: z.literal(true) }).strict();

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const input = enrollRequest.safeParse(await bounded.json().catch(() => null));
  if (!input.success) return failure(400, "INVALID_REFERRAL_ENROLL_REQUEST");
  try {
    const upstream = await authenticatedApiFetch(bounded, "/auth/referrals/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.data),
    });
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "REFERRAL_ENROLL_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const status = parseReferralEnrollment(body);
    return status ? NextResponse.json({ accepted: true, status }, { headers }) : failure(502, "INVALID_REFERRAL_ENROLL_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "REFERRAL_ENROLL_UNAVAILABLE");
  }
}
