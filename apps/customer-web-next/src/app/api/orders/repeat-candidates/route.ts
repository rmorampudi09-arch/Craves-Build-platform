import { NextRequest, NextResponse } from "next/server";
import {
  parseRepeatOrderPage,
  REPEAT_ORDER_MAX_PAGE_SIZE,
  REPEAT_ORDER_PAGE_SIZE,
} from "@/features/orders/lib/repeat-order-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const failure = (status: number, code: string) => NextResponse.json({ code }, { status, headers });

/** The customer's delivered orders that can be ordered again ("Your usual"), newest first. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = params.get("limit") ?? String(REPEAT_ORDER_PAGE_SIZE),
    cursor = params.get("cursor");
  if (
    !/^\d{1,2}$/.test(limit) ||
    Number(limit) < 1 ||
    Number(limit) > REPEAT_ORDER_MAX_PAGE_SIZE ||
    (cursor !== null && !/^[A-Za-z0-9_-]{1,512}$/.test(cursor))
  ) {
    return failure(400, "INVALID_REPEAT_ORDERS_QUERY");
  }
  const query = new URLSearchParams({ limit: String(Number(limit)) });
  if (cursor) query.set("cursor", cursor);
  try {
    const upstream = await authenticatedApiFetch(request, `/orders/repeat-candidates?${query}`);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      // order-service answers unexpected failures with an empty 403, so a 403 keeps a generic code rather than reading as signed out.
      const mapped = upstreamFailure(upstream.status, body, "REPEAT_ORDERS_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const page = parseRepeatOrderPage(body);
    return page
      ? NextResponse.json(page, { headers })
      : failure(502, "INVALID_REPEAT_ORDERS_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "SESSION_EXPIRED")
      : failure(503, "REPEAT_ORDERS_UNAVAILABLE");
  }
}
