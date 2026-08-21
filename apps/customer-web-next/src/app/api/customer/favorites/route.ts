import { NextRequest, NextResponse } from "next/server";
import { parseCustomerFavorites } from "@/lib/customer-favorites-contract";
import {
  authenticatedApiFetch,
  SessionRequiredError,
} from "@/lib/server-api";

function failure(status: number) {
  const message = status === 401
    ? "Please sign in again."
    : status === 403
      ? "Customer access is required to use favorites."
      : status === 502
        ? "Craves received an invalid favorites response."
        : "Favorites are temporarily unavailable.";

  return NextResponse.json({
    error: status === 401
      ? "SESSION_REQUIRED"
      : status === 403
        ? "CUSTOMER_ROLE_REQUIRED"
        : status === 502
          ? "INVALID_FAVORITES_RESPONSE"
          : "FAVORITES_UNAVAILABLE",
    message,
  }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/customer/favorites");
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return failure(upstream.status);

    const favorites = parseCustomerFavorites(body);
    return favorites
      ? NextResponse.json(favorites, { headers: { "Cache-Control": "no-store" } })
      : failure(502);
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401)
      : failure(503);
  }
}
