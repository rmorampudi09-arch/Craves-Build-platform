import { NextRequest, NextResponse } from "next/server";
import { parseCustomerOrders } from "@/lib/order-contract";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/orders");
    if (!upstream.ok) {
      return NextResponse.json({ code: upstream.status === 401 ? "SESSION_EXPIRED" : "ORDERS_UNAVAILABLE" }, { status: upstream.status });
    }
    const orders = parseCustomerOrders(await upstream.json().catch(() => null));
    if (!orders) return NextResponse.json({ code: "INVALID_ORDERS_RESPONSE" }, { status: 502 });
    const response = NextResponse.json(orders);
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ code: timedOut ? "ORDERS_TIMEOUT" : "ORDERS_UNAVAILABLE" }, { status: timedOut ? 504 : 503 });
  }
}
