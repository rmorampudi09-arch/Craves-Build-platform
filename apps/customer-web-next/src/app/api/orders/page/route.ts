import { NextRequest, NextResponse } from "next/server";
import { parseCustomerOrderPage } from "@/features/orders/lib/order-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

/** One page of My Orders, newest first (order-service GET /api/v1/orders/page), like the chef's order history. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = params.get("limit") ?? "20", cursor = params.get("cursor");
  if (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50 || (cursor !== null && !/^[A-Za-z0-9_-]{1,512}$/.test(cursor))) {
    return failure(400, "INVALID_ORDER_HISTORY_QUERY");
  }
  const query = new URLSearchParams({ limit: String(Number(limit)) });
  if (cursor) query.set("cursor", cursor);
  try {
    const upstream = await authenticatedApiFetch(request, `/orders/page?${query}`);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "ORDER_HISTORY_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const page = parseCustomerOrderPage(body);
    return page ? NextResponse.json(page, { headers }) : failure(502, "INVALID_ORDER_HISTORY_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "ORDER_HISTORY_UNAVAILABLE");
  }
}
