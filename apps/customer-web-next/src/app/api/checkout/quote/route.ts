import { NextRequest, NextResponse } from "next/server";
import {
  parseCheckoutQuote,
  parseCheckoutQuoteInput,
} from "@/lib/checkout-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

function upstreamError(body: unknown, fallback: string): { error: string; message: string } {
  if (body && typeof body === "object") {
    const raw = body as Record<string, unknown>;
    const error = typeof raw.error === "string" ? raw.error : "PRICING_QUOTE_FAILED";
    const message = typeof raw.message === "string" ? raw.message : fallback;
    return { error, message };
  }
  return { error: "PRICING_QUOTE_FAILED", message: fallback };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "ORIGIN_REJECTED", message: "Invalid checkout pricing request origin." },
      { status: 403 },
    );
  }

  const input = parseCheckoutQuoteInput(await request.json().catch(() => null));
  if (!input) {
    return NextResponse.json(
      { error: "INVALID_PRICING_QUOTE", message: "Choose a valid saved delivery address." },
      { status: 400 },
    );
  }

  try {
    const upstream = await authenticatedApiFetch(
      request,
      "/checkout/quote",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      20_000,
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      if (upstream.status === 401) {
        return NextResponse.json(
          { error: "SESSION_REQUIRED", message: "Please sign in again." },
          { status: 401 },
        );
      }
      return NextResponse.json(
        upstreamError(body, "Delivery pricing could not be calculated."),
        { status: upstream.status },
      );
    }

    const quote = parseCheckoutQuote(body);
    return quote
      ? NextResponse.json(quote, {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        })
      : NextResponse.json(
          {
            error: "INVALID_UPSTREAM_RESPONSE",
            message: "Delivery pricing response validation failed.",
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
            ? "PRICING_QUOTE_TIMEOUT"
            : "PRICING_QUOTE_UNAVAILABLE",
        message: sessionRequired
          ? "Please sign in again."
          : "Delivery pricing is unavailable right now.",
      },
      { status: sessionRequired ? 401 : timedOut ? 504 : 503 },
    );
  }
}
