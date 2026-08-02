import { NextRequest, NextResponse } from "next/server";
import { parsePaymentVerification } from "@/lib/payment-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

export async function POST(request: NextRequest, context: { params: Promise<{ paymentOrderId: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED", message: "Invalid payment verification origin." }, { status: 403 });
  const { paymentOrderId } = await context.params;
  if (!isUuid(paymentOrderId)) return NextResponse.json({ error: "INVALID_PAYMENT_ORDER_ID", message: "Payment order id is invalid." }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, `/payments/orders/${paymentOrderId}/verify`, { method: "POST" }, 20_000);
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const message = upstream.status === 401 ? "Please sign in again." : upstream.status === 404 ? "Payment order was not found." : "Payment verification failed.";
      return NextResponse.json({ error: upstream.status === 401 ? "SESSION_REQUIRED" : "PAYMENT_VERIFY_FAILED", message }, { status: upstream.status });
    }
    const verification = parsePaymentVerification(body);
    return verification ? NextResponse.json(verification, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Payment verification response validation failed." }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ error: "SESSION_REQUIRED", message: "Please sign in again." }, { status: 401 });
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ error: timeout ? "PAYMENT_VERIFY_TIMEOUT" : "PAYMENT_UNAVAILABLE", message: "Payment verification is unavailable right now." }, { status: timeout ? 504 : 502 });
  }
}
