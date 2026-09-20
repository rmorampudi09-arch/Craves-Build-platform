import { NextRequest, NextResponse } from "next/server";

import { parseCustomerAddress } from "@/lib/address-contract";
import { isSameOrigin } from "@/lib/request-security";
import {
  authenticatedApiFetch,
  isUuid,
  SessionRequiredError,
} from "@/lib/server-api";

function failure(status: number) {
  return NextResponse.json(
    {
      error:
        status === 401
          ? "SESSION_REQUIRED"
          : status === 404
            ? "ADDRESS_NOT_FOUND"
            : "ADDRESS_REQUEST_FAILED",
      message:
        status === 401
          ? "Please sign in again."
          : status === 404
            ? "Address was not found."
            : "Default address could not be updated.",
    },
    { status },
  );
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ addressId: string }> },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "ORIGIN_REJECTED" }, { status: 403 });
  }

  const { addressId } = await context.params;
  if (!isUuid(addressId)) return failure(400);

  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/customer/addresses/${addressId}/default`,
      { method: "PUT" },
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return failure(upstream.status);

    const address = parseCustomerAddress(body);
    return address
      ? NextResponse.json(address, {
          headers: { "Cache-Control": "no-store" },
        })
      : failure(502);
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401) : failure(503);
  }
}
