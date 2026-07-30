import { NextRequest, NextResponse } from "next/server";
import { parsePaymentCreateInput, parsePaymentSession } from "@/lib/payment-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

function safeIdentity(value: unknown): { displayName: string; email: string | null; phoneNumber: string } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const phoneNumber = typeof raw.phoneNumber === "string" ? raw.phoneNumber.trim() : "";
  const displayName = typeof raw.displayName === "string" && raw.displayName.trim() ? raw.displayName.trim().slice(0, 160) : "Craves Customer";
  const email = typeof raw.email === "string" && raw.email.trim() ? raw.email.trim().slice(0, 320) : null;
  return /^\+?[0-9]{10,15}$/.test(phoneNumber) ? { displayName, email, phoneNumber } : null;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED", message: "Invalid payment request origin." }, { status: 403 });
  const input = parsePaymentCreateInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "INVALID_CHECKOUT_ID", message: "A valid checkout id is required." }, { status: 400 });
  try {
    const identityResponse = await authenticatedApiFetch(request, "/auth/me");
    const identityRaw = await identityResponse.json().catch(() => null);
    if (!identityResponse.ok) return NextResponse.json({ error: "SESSION_REQUIRED", message: "Please sign in again." }, { status: identityResponse.status });
    const identity = safeIdentity(identityRaw);
    if (!identity) return NextResponse.json({ error: "INVALID_IDENTITY_RESPONSE", message: "Customer profile could not be used for payment." }, { status: 502 });

    const origin = request.nextUrl.origin;
    if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) return NextResponse.json({ error: "HTTPS_REQUIRED", message: "Secure HTTPS is required for payment." }, { status: 500 });
    const upstream = await authenticatedApiFetch(request, "/payments/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkoutId: input.checkoutId,
        customerName: identity.displayName,
        customerEmail: identity.email,
        customerPhone: identity.phoneNumber,
        returnUrl: `${origin}/checkout/${input.checkoutId}/payment`
      })
    }, 20_000);
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const message = upstream.status === 401 ? "Please sign in again." : upstream.status === 400 ? "Checkout is not ready for payment." : "Payment order could not be created.";
      return NextResponse.json({ error: upstream.status === 401 ? "SESSION_REQUIRED" : "PAYMENT_CREATE_FAILED", message }, { status: upstream.status });
    }
    const session = parsePaymentSession(body);
    return session ? NextResponse.json(session, { status: 201, headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Payment response validation failed." }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ error: "SESSION_REQUIRED", message: "Please sign in again." }, { status: 401 });
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ error: timeout ? "PAYMENT_TIMEOUT" : "PAYMENT_UNAVAILABLE", message: "Payment is unavailable right now." }, { status: timeout ? 504 : 502 });
  }
}
