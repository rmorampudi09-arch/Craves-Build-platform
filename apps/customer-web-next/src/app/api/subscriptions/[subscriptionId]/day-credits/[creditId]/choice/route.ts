import { NextRequest, NextResponse } from "next/server";
import { parseDayCredit, parseDayCreditChoice } from "@/features/meal-plans/lib/subscription-contract";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

/** A refund request or the days at the end for one declined day or pause; made once. */
export async function POST(request: NextRequest, context: { params: Promise<{ subscriptionId: string; creditId: string }> }) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const { subscriptionId, creditId } = await context.params;
  if (!isUuid(subscriptionId) || !isUuid(creditId)) return failure(400, "INVALID_DAY_CREDIT_ID");
  const input = parseDayCreditChoice(await bounded.json().catch(() => null));
  if (!input) return failure(400, "INVALID_DAY_CREDIT_CHOICE");
  try {
    const upstream = await authenticatedApiFetch(bounded, `/subscriptions/${subscriptionId}/day-credits/${creditId}/choice`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    });
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "DAY_CREDIT_CHOICE_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const credit = parseDayCredit(body);
    return credit?.id === creditId ? NextResponse.json(credit, { headers }) : failure(502, "INVALID_DAY_CREDIT_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "SUBSCRIPTION_UNAVAILABLE");
  }
}
