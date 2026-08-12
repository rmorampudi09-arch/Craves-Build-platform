import { NextRequest, NextResponse } from "next/server";
import { parseCustomerProfile } from "@/lib/profile-contract";
import { isSameOrigin } from "@/lib/request-security";
import { parseSubscriptionPayment } from "@/lib/subscription-payment-contract";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

function failure(status: number, code = "SUBSCRIPTION_PAYMENT_ORDER_FAILED") {
  if (status === 401) return NextResponse.json({ code: "SESSION_EXPIRED" }, { status });
  if (status === 403) return NextResponse.json({ code: "SUBSCRIPTION_PAYMENT_ACCESS_DENIED" }, { status });
  if (status === 404) return NextResponse.json({ code: "SUBSCRIPTION_PAYMENT_NOT_READY" }, { status });
  return NextResponse.json({ code }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ subscriptionId: string }> },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 });
  }
  if (process.env.NEXT_PUBLIC_CASHFREE_MODE !== "sandbox") {
    return NextResponse.json({ code: "SUBSCRIPTION_SANDBOX_CHECKOUT_DISABLED" }, { status: 503 });
  }

  const { subscriptionId } = await params;
  if (!isUuid(subscriptionId)) {
    return NextResponse.json({ code: "INVALID_SUBSCRIPTION_ID" }, { status: 400 });
  }

  try {
    const paymentResponse = await authenticatedApiFetch(
      request,
      `/subscription-payments/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
    const paymentBody = await paymentResponse.json().catch(() => null);
    if (!paymentResponse.ok) return failure(paymentResponse.status);
    const payment = parseSubscriptionPayment(paymentBody);
    if (!payment) {
      return NextResponse.json({ code: "INVALID_SUBSCRIPTION_PAYMENT_RESPONSE" }, { status: 502 });
    }
    if (payment.status === "PAID") {
      return NextResponse.json(payment, { headers: { "Cache-Control": "no-store" } });
    }

    const profileResponse = await authenticatedApiFetch(request, "/customer/profile");
    const profileBody = await profileResponse.json().catch(() => null);
    if (!profileResponse.ok) return failure(profileResponse.status, "CUSTOMER_PROFILE_UNAVAILABLE");
    const profile = parseCustomerProfile(profileBody);
    if (!profile) {
      return NextResponse.json({ code: "INVALID_CUSTOMER_PROFILE_RESPONSE" }, { status: 502 });
    }

    const publicOrigin = request.nextUrl.origin.startsWith("https://") ? request.nextUrl.origin : null;
    const returnUrl = publicOrigin
      ? `${publicOrigin}/subscriptions/${encodeURIComponent(subscriptionId)}/payment?returned=1`
      : null;

    const upstream = await authenticatedApiFetch(
      request,
      `/subscription-payments/invoices/${encodeURIComponent(payment.invoiceId)}/orders`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: `${profile.firstName} ${profile.lastName}`.trim(),
          customerPhone: profile.registeredPhoneNumber,
          customerEmail: profile.email,
          returnUrl,
        }),
      },
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return failure(upstream.status);
    const created = parseSubscriptionPayment(body);
    return created
      ? NextResponse.json(created, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ code: "INVALID_SUBSCRIPTION_PAYMENT_RESPONSE" }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return failure(401);
    return failure(503);
  }
}
