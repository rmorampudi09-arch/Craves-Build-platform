import { NextRequest, NextResponse } from "next/server";
import { parseCheckout, parseCheckoutInput } from "@/lib/checkout-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED", message: "Invalid checkout request origin." }, { status: 403 });
  const input = parseCheckoutInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "INVALID_CHECKOUT", message: "Choose a valid saved delivery address." }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, "/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, 15_000);
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const message = upstream.status === 401 ? "Please sign in again." : upstream.status === 400 ? "Checkout validation failed. Review your cart and delivery address." : "Checkout could not be created.";
      return NextResponse.json({ error: upstream.status === 401 ? "SESSION_REQUIRED" : "CHECKOUT_FAILED", message }, { status: upstream.status });
    }
    const checkout = parseCheckout(body);
    return checkout ? NextResponse.json(checkout, { status: 201, headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Checkout response validation failed." }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ error: "SESSION_REQUIRED", message: "Please sign in again." }, { status: 401 });
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ error: timeout ? "CHECKOUT_TIMEOUT" : "CHECKOUT_UNAVAILABLE", message: "Checkout is unavailable right now." }, { status: timeout ? 504 : 502 });
  }
}
