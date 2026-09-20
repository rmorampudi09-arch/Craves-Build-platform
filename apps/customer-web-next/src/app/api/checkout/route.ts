import { boundBffRequest } from "@/lib/bff-request-limits";
import { NextRequest, NextResponse } from "next/server";
import { parseCheckout, parseCheckoutInput } from "@/lib/checkout-contract";
import { isSameOrigin } from "@/lib/request-security";
import {
  authenticatedApiFetch,
  SessionRequiredError,
} from "@/lib/server-api";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeText(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

const SAFE_CHECKOUT_SERVICE_ERRORS = new Set([
  "DELIVERY_ADDRESS_LOOKUP_UNAVAILABLE",
  "DELIVERY_ADDRESS_LOOKUP_INVALID_RESPONSE",
  "DELIVERY_ADDRESS_LOOKUP_UNAUTHORIZED",
  "LAUNCH_POLICY_NOT_CONFIGURED",
  "LAUNCH_POLICY_CURRENCY_UNSUPPORTED",
]);

function checkoutFailure(
  status: number,
  body: unknown,
): { error: string; message: string } {
  if (status === 401) {
    return { error: "SESSION_REQUIRED", message: "Please sign in again." };
  }

  const raw = record(body);
  const upstreamCode = safeText(raw?.error, 80);
  const upstreamMessage =
    safeText(raw?.message) ?? safeText(raw?.detail);

  if (
    upstreamMessage &&
    (
      (status >= 400 && status < 500) ||
      (status === 503 &&
        upstreamCode !== null &&
        SAFE_CHECKOUT_SERVICE_ERRORS.has(upstreamCode))
    )
  ) {
    return {
      error: upstreamCode ?? "CHECKOUT_FAILED",
      message: upstreamMessage,
    };
  }

  if (status === 400) {
    return {
      error: "CHECKOUT_FAILED",
      message: "Checkout validation failed. Review your cart and delivery address.",
    };
  }

  return {
    error: "CHECKOUT_FAILED",
    message: "Checkout could not be created.",
  };
}

export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  request = bounded;

  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "ORIGIN_REJECTED", message: "Invalid checkout request origin." },
      { status: 403 },
    );
  }

  const input = parseCheckoutInput(await request.json().catch(() => null));
  if (!input) {
    return NextResponse.json(
      {
        error: "INVALID_CHECKOUT",
        message: "Choose a valid saved delivery address.",
      },
      { status: 400 },
    );
  }

  try {
    const upstream = await authenticatedApiFetch(
      request,
      "/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      15_000,
    );
    const body = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return NextResponse.json(checkoutFailure(upstream.status, body), {
        status: upstream.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const checkout = parseCheckout(body);
    return checkout
      ? NextResponse.json(checkout, {
          status: 201,
          headers: { "Cache-Control": "no-store" },
        })
      : NextResponse.json(
          {
            error: "INVALID_UPSTREAM_RESPONSE",
            message: "Checkout response validation failed.",
          },
          { status: 502 },
        );
  } catch (error) {
    const sessionRequired = error instanceof SessionRequiredError;
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: sessionRequired
          ? "SESSION_REQUIRED"
          : timedOut
            ? "CHECKOUT_TIMEOUT"
            : "CHECKOUT_UNAVAILABLE",
        message: sessionRequired
          ? "Please sign in again."
          : timedOut
            ? "Checkout took too long. Try again."
            : "Checkout is unavailable right now.",
      },
      { status: sessionRequired ? 401 : timedOut ? 504 : 503 },
    );
  }
}
