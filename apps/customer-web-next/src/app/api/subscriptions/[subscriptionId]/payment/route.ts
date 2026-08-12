import { NextRequest, NextResponse } from "next/server";
import { parseSubscriptionPayment } from "@/lib/subscription-payment-contract";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

function failure(status: number) {
  if (status === 401) return NextResponse.json({ code: "SESSION_EXPIRED" }, { status });
  if (status === 403) return NextResponse.json({ code: "SUBSCRIPTION_PAYMENT_ACCESS_DENIED" }, { status });
  if (status === 404) return NextResponse.json({ code: "SUBSCRIPTION_PAYMENT_NOT_READY" }, { status });
  return NextResponse.json({ code: "SUBSCRIPTION_PAYMENT_UNAVAILABLE" }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ subscriptionId: string }> },
) {
  const { subscriptionId } = await params;
  if (!isUuid(subscriptionId)) {
    return NextResponse.json({ code: "INVALID_SUBSCRIPTION_ID" }, { status: 400 });
  }

  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/subscription-payments/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return failure(upstream.status);
    const payment = parseSubscriptionPayment(body);
    return payment
      ? NextResponse.json(payment, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ code: "INVALID_SUBSCRIPTION_PAYMENT_RESPONSE" }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return failure(401);
    return failure(503);
  }
}
