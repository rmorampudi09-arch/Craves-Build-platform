import { NextRequest, NextResponse } from "next/server";
import { isScheduleUuid, parseChefScheduleAnswer, parseChefScheduleAnswerResult } from "@/features/chef/lib/chef-scheduled-orders";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const failure = (status: number, code: string) => NextResponse.json({ code }, { status, headers });

/** The chef confirms or declines one scheduled order; order-service refuses a changed, answered or passed request (409). */
export async function PUT(request: NextRequest, context: { params: Promise<{ scheduleRequestId: string; orderId: string }> }) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const { scheduleRequestId, orderId } = await context.params;
  if (!isScheduleUuid(scheduleRequestId) || !isScheduleUuid(orderId)) return failure(400, "INVALID_SCHEDULED_ORDER_ID");
  const answer = parseChefScheduleAnswer(await bounded.json().catch(() => null));
  if (!answer) return failure(400, "INVALID_SCHEDULE_ANSWER");
  try {
    const upstream = await authenticatedApiFetch(bounded, `/chef/scheduled-orders/${scheduleRequestId}/orders/${orderId}/response`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answer),
    });
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "CHEF_SCHEDULE_ANSWER_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const result = parseChefScheduleAnswerResult(body);
    return result && result.orderId.toLowerCase() === orderId.toLowerCase()
      ? NextResponse.json(result, { headers })
      : failure(502, "INVALID_CHEF_SCHEDULE_ANSWER_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "CHEF_SCHEDULE_ANSWER_UNAVAILABLE");
  }
}
