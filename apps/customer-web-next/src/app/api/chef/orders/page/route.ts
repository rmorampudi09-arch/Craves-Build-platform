import { NextRequest, NextResponse } from "next/server";
import { isChefOrderStatus, parseChefOrderHistoryPage } from "@/features/chef/lib/chef-order-contract";
import { FEATURE_NOT_AVAILABLE, upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = params.get("limit") ?? "20", cursor = params.get("cursor"), status = params.get("status");
  if (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50 || (cursor !== null && (!cursor || cursor.length > 512)) || (status !== null && !isChefOrderStatus(status))) {
    return failure(400, "INVALID_CHEF_ORDER_HISTORY_QUERY");
  }
  const query = new URLSearchParams({ limit: String(Number(limit)) });
  if (cursor) query.set("cursor", cursor);
  if (status) query.set("status", status);
  try {
    const upstream = await authenticatedApiFetch(request, `/chef/orders/page?${query}`);
    const body: unknown = await upstream.json().catch(() => null);
    if (upstream.status === 404) return failure(404, FEATURE_NOT_AVAILABLE);
    if (!upstream.ok) {
      // order-service answers unexpected failures with an empty 403, so a 403 keeps a generic code rather than reading as signed out.
      const mapped = upstreamFailure(upstream.status, body, "CHEF_ORDER_HISTORY_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const page = parseChefOrderHistoryPage(body);
    return page ? NextResponse.json(page, { headers }) : failure(502, "INVALID_CHEF_ORDER_HISTORY_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "CHEF_ORDER_HISTORY_UNAVAILABLE");
  }
}
