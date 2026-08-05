import { NextRequest, NextResponse } from "next/server";
import {
  parseAddressInput,
  parseCustomerAddress,
  parseCustomerAddresses,
} from "@/lib/address-contract";
import { isSameOrigin } from "@/lib/request-security";
import {
  authenticatedApiFetch,
  SessionRequiredError,
} from "@/lib/server-api";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function addressListPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  const raw = object(value);
  if (!raw) return value;

  for (const key of ["addresses", "items", "data", "content", "results"]) {
    const candidate = raw[key];
    if (Array.isArray(candidate)) return candidate;
    const nested = object(candidate);
    if (nested) {
      for (const nestedKey of ["addresses", "items", "content", "results"]) {
        if (Array.isArray(nested[nestedKey])) return nested[nestedKey];
      }
    }
  }

  return value;
}

function addressPayload(value: unknown): unknown {
  const raw = object(value);
  if (!raw) return value;

  for (const key of ["address", "data", "item", "result"]) {
    const candidate = raw[key];
    if (object(candidate)) return candidate;
  }

  return value;
}

function upstreamErrorMessage(value: unknown): string | null {
  const raw = object(value);
  if (!raw) return null;

  for (const key of ["message", "error_description", "detail"]) {
    const candidate = raw[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 240);
    }
  }

  const nestedError = object(raw.error);
  if (nestedError && typeof nestedError.message === "string") {
    return nestedError.message.trim().slice(0, 240);
  }

  return typeof raw.error === "string" ? raw.error.trim().slice(0, 240) : null;
}

function failure(status: number, upstreamBody?: unknown) {
  if (status === 401) {
    return NextResponse.json(
      { error: "SESSION_REQUIRED", message: "Please sign in again." },
      { status },
    );
  }

  return NextResponse.json(
    {
      error: "ADDRESS_REQUEST_FAILED",
      message:
        upstreamErrorMessage(upstreamBody) ??
        "Address request could not be completed.",
      upstreamStatus: status,
    },
    { status },
  );
}

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/customer/addresses");
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return failure(upstream.status, body);

    const addresses = parseCustomerAddresses(addressListPayload(body));
    return addresses
      ? NextResponse.json(addresses, {
          headers: { "Cache-Control": "no-store" },
        })
      : failure(502, {
          message: "The address service returned an unsupported response format.",
        });
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401)
      : failure(503, {
          message: "The address service could not be reached.",
        });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "ORIGIN_REJECTED", message: "Invalid address request origin." },
      { status: 403 },
    );
  }

  const input = parseAddressInput(await request.json().catch(() => null));
  if (!input) {
    return NextResponse.json(
      {
        error: "INVALID_ADDRESS",
        message: "Enter a complete valid address and map coordinates.",
      },
      { status: 400 },
    );
  }

  try {
    const upstream = await authenticatedApiFetch(
      request,
      "/customer/addresses",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return failure(upstream.status, body);

    const address = parseCustomerAddress(addressPayload(body));
    return address
      ? NextResponse.json(address, {
          status: 201,
          headers: { "Cache-Control": "no-store" },
        })
      : failure(502, {
          message: "The address service returned an unsupported response format.",
        });
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401)
      : failure(503, {
          message: "The address service could not be reached.",
        });
  }
}
