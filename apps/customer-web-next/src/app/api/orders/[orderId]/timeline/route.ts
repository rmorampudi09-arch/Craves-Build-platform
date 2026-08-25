import { NextRequest, NextResponse } from "next/server";
import { parseOrderTrackingTimeline } from "@/lib/realtime-order-tracking-contract";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  if (!isUuid(orderId)) {
    return NextResponse.json({ code: "INVALID_ORDER_ID" }, { status: 400 });
  }

  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/orders/${encodeURIComponent(orderId)}/timeline`,
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json(
        { code: upstream.status === 404 ? "ORDER_NOT_FOUND" : upstream.status === 401 ? "SESSION_EXPIRED" : "TRACKING_UNAVAILABLE" },
        { status: upstream.status },
      );
    }
    const timeline = parseOrderTrackingTimeline(body);
    return timeline
      ? NextResponse.json(timeline, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ code: "INVALID_TRACKING_RESPONSE" }, { status: 502 });
  } catch (error) {
    const authenticationRequired = error instanceof SessionRequiredError;
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { code: authenticationRequired ? "AUTHENTICATION_REQUIRED" : timedOut ? "TRACKING_TIMEOUT" : "TRACKING_UNAVAILABLE" },
      { status: authenticationRequired ? 401 : timedOut ? 504 : 503 },
    );
  }
}
