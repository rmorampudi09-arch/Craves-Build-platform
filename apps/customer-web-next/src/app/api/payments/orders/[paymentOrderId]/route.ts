import { NextRequest, NextResponse } from "next/server";
import { parsePaymentStatus } from "@/lib/payment-contract";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

export async function GET(request: NextRequest, context: { params: Promise<{ paymentOrderId: string }> }) {
  const { paymentOrderId } = await context.params;
  if (!isUuid(paymentOrderId)) return NextResponse.json({ error: "INVALID_PAYMENT_ORDER_ID", message: "Payment order id is invalid." }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, `/payments/orders/${paymentOrderId}`);
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const message = upstream.status === 401 ? "Please sign in again." : upstream.status === 404 ? "Payment order was not found." : "Payment status could not be loaded.";
      return NextResponse.json({ error: upstream.status === 401 ? "SESSION_REQUIRED" : "PAYMENT_STATUS_FAILED", message }, { status: upstream.status });
    }
    const payment = parsePaymentStatus(body);
    return payment ? NextResponse.json(payment, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Payment response validation failed." }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ error: "SESSION_REQUIRED", message: "Please sign in again." }, { status: 401 });
    return NextResponse.json({ error: "PAYMENT_UNAVAILABLE", message: "Payment status is unavailable right now." }, { status: 502 });
  }
}
