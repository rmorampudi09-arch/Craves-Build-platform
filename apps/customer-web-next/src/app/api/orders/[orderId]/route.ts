import { NextRequest, NextResponse } from "next/server";
import { parseCustomerOrder } from "@/lib/order-contract";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  if (!isUuid(orderId)) return NextResponse.json({ code: "INVALID_ORDER_ID" }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, `/orders/${orderId}`);
    if (!upstream.ok) {
      const code = upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 404 ? "ORDER_NOT_FOUND" : "ORDER_UNAVAILABLE";
      return NextResponse.json({ code }, { status: upstream.status });
    }
    const order = parseCustomerOrder(await upstream.json().catch(() => null));
    if (!order) return NextResponse.json({ code: "INVALID_ORDER_RESPONSE" }, { status: 502 });
    const response = NextResponse.json(order);
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ code: timedOut ? "ORDER_TIMEOUT" : "ORDER_UNAVAILABLE" }, { status: timedOut ? 504 : 503 });
  }
}
