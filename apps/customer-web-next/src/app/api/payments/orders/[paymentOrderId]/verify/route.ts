import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { NextRequest, NextResponse } from "next/server";
import { parsePaymentVerification } from "@/features/checkout/lib/payment-contract";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";

/** Only the three Razorpay checkout fields reach the backend, in the shape it expects; nothing else is relayed. */
function parseVerificationInput(raw: unknown): { providerOrderId: string; providerPaymentId: string; providerSignature: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { providerOrderId, providerPaymentId, providerSignature } = raw as Record<string, unknown>;
  const id = (value: unknown, prefix: string) => typeof value === "string" && new RegExp(`^${prefix}[A-Za-z0-9]{1,64}$`).test(value) ? value : null;
  const orderId = id(providerOrderId, "order_");
  const paymentId = id(providerPaymentId, "pay_");
  const signature = typeof providerSignature === "string" && /^[a-f0-9]{64}$/i.test(providerSignature) ? providerSignature : null;
  return orderId && paymentId && signature ? { providerOrderId: orderId, providerPaymentId: paymentId, providerSignature: signature } : null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ paymentOrderId: string }> }) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  request = bounded;

  if (!isSameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED", message: "Invalid payment verification origin." }, { status: 403 });
  const { paymentOrderId } = await context.params; if (!isUuid(paymentOrderId)) return NextResponse.json({ error: "INVALID_PAYMENT_ORDER_ID", message: "Payment order id is invalid." }, { status: 400 });
  const verification = parseVerificationInput(await request.json().catch(() => null));
  if (!verification) return NextResponse.json({ error: "INVALID_PAYMENT_VERIFICATION", message: "Payment verification details are invalid." }, { status: 400 });
  try { const upstream = await authenticatedApiFetch(request, `/payments/orders/${paymentOrderId}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(verification) }, 20_000); const body = await upstream.json().catch(() => null); if (!upstream.ok) return NextResponse.json({ error: upstream.status === 401 ? "SESSION_REQUIRED" : "PAYMENT_VERIFY_FAILED", message: upstream.status === 401 ? "Please sign in again." : upstream.status === 404 ? "Payment order was not found." : "We couldn’t confirm this payment yet. Don’t pay again: check Your orders in a minute." }, { status: upstream.status }); const result = parsePaymentVerification(body); return result ? NextResponse.json(result, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Payment verification response validation failed." }, { status: 502 }); }
  catch (error) { const timeout = error instanceof Error && error.name === "AbortError"; return NextResponse.json({ error: error instanceof SessionRequiredError ? "SESSION_REQUIRED" : timeout ? "PAYMENT_VERIFY_TIMEOUT" : "PAYMENT_UNAVAILABLE", message: error instanceof SessionRequiredError ? "Please sign in again." : "Payment verification is unavailable right now." }, { status: error instanceof SessionRequiredError ? 401 : timeout ? 504 : 502 }); }
}
