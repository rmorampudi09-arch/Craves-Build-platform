import { NextRequest, NextResponse } from "next/server";
import {
  parseCheckoutOperationRequest,
  parseCheckoutOperationResponse,
} from "@/lib/checkout-operation-contract";
import { boundBffRequest } from "@/lib/bff-request-limits";
import { isSameOrigin } from "@/lib/request-security";
import {
  authenticatedApiFetch,
  isUuid,
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

function upstreamFailure(
  status: number,
  body: unknown,
): { error: string; message: string } {
  if (status === 401) {
    return { error: "SESSION_REQUIRED", message: "Please sign in again." };
  }
  const raw = record(body);
  const code = safeText(raw?.error, 80) ?? safeText(raw?.code, 80);
  const message = safeText(raw?.message) ?? safeText(raw?.detail);

  if (message && (status < 500 || status === 503)) {
    return { error: code ?? "CHECKOUT_OPERATION_FAILED", message };
  }

  return {
    error: code ?? "CHECKOUT_OPERATION_FAILED",
    message:
      status === 503
        ? "Checkout is temporarily unavailable. Please try again."
        : "Checkout could not be created.",
  };
}

async function operationRequest(
  request: NextRequest,
  operationId: string,
  init?: RequestInit,
) {
  return authenticatedApiFetch(
    request,
    `/checkout/operations/${encodeURIComponent(operationId)}`,
    init,
    15_000,
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operationId: string }> },
) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  request = bounded;

  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "ORIGIN_REJECTED", message: "Invalid checkout request origin." },
      { status: 403 },
    );
  }

  const { operationId } = await params;
  if (!isUuid(operationId)) {
    return NextResponse.json(
      {
        error: "INVALID_CHECKOUT_OPERATION_ID",
        message: "Checkout attempt id is invalid.",
      },
      { status: 400 },
    );
  }

  const input = parseCheckoutOperationRequest(
    await request.json().catch(() => null),
  );
  if (!input) {
    return NextResponse.json(
      {
        error: "INVALID_CHECKOUT_OPERATION",
        message: "Review your cart and delivery address before checkout.",
      },
      { status: 400 },
    );
  }

  try {
    const upstream = await operationRequest(request, operationId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json(upstreamFailure(upstream.status, body), {
        status: upstream.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const parsed = parseCheckoutOperationResponse(body);
    return parsed
      ? NextResponse.json(parsed, {
          headers: { "Cache-Control": "no-store" },
        })
      : NextResponse.json(
          {
            error: "INVALID_UPSTREAM_RESPONSE",
            message: "Checkout attempt response validation failed.",
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ operationId: string }> },
) {
  const { operationId } = await params;
  if (!isUuid(operationId)) {
    return NextResponse.json(
      {
        error: "INVALID_CHECKOUT_OPERATION_ID",
        message: "Checkout attempt id is invalid.",
      },
      { status: 400 },
    );
  }

  try {
    const upstream = await operationRequest(request, operationId, {
      method: "GET",
      cache: "no-store",
    });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json(upstreamFailure(upstream.status, body), {
        status: upstream.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const parsed = parseCheckoutOperationResponse(body);
    return parsed
      ? NextResponse.json(parsed, {
          headers: { "Cache-Control": "no-store" },
        })
      : NextResponse.json(
          {
            error: "INVALID_UPSTREAM_RESPONSE",
            message: "Checkout attempt response validation failed.",
          },
          { status: 502 },
        );
  } catch (error) {
    const sessionRequired = error instanceof SessionRequiredError;
    return NextResponse.json(
      {
        error: sessionRequired ? "SESSION_REQUIRED" : "CHECKOUT_UNAVAILABLE",
        message: sessionRequired
          ? "Please sign in again."
          : "Checkout is unavailable right now.",
      },
      { status: sessionRequired ? 401 : 503 },
    );
  }
}
