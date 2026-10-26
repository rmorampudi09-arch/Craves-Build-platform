import { NextRequest, NextResponse } from "next/server";
import { isScheduleResponseStatus, parseChefScheduledOrderPage, SCHEDULE_CURSOR } from "@/features/chef/lib/chef-scheduled-orders";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const failure = (status: number, code: string) => NextResponse.json({ code }, { status, headers });

/** A page of the chef's scheduled-order requests, soonest first. A gateway without the route answers FEATURE_NOT_AVAILABLE. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = params.get("limit") ?? "20", cursor = params.get("cursor"), responseStatus = params.get("responseStatus");
  if (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 || (cursor !== null && !SCHEDULE_CURSOR.test(cursor)) || (responseStatus !== null && !isScheduleResponseStatus(responseStatus))) {
    return failure(400, "INVALID_CHEF_SCHEDULED_ORDERS_QUERY");
  }
  const query = new URLSearchParams({ limit: String(Number(limit)) });
  if (responseStatus) query.set("responseStatus", responseStatus);
  if (cursor) query.set("cursor", cursor);
  try {
    const upstream = await authenticatedApiFetch(request, `/chef/scheduled-orders?${query}`);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "CHEF_SCHEDULED_ORDERS_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const page = parseChefScheduledOrderPage(body);
    return page ? NextResponse.json(page, { headers }) : failure(502, "INVALID_CHEF_SCHEDULED_ORDERS_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "CHEF_SCHEDULED_ORDERS_UNAVAILABLE");
  }
}
