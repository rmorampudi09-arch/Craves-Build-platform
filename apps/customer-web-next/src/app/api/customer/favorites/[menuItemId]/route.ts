import { NextRequest, NextResponse } from "next/server";
import { parseCustomerFavorite } from "@/lib/customer-favorites-contract";
import { isSameOrigin } from "@/lib/request-security";
import {
  authenticatedApiFetch,
  isUuid,
  SessionRequiredError,
} from "@/lib/server-api";

function failure(status: number) {
  const message = status === 400
    ? "A valid dish is required."
    : status === 401
      ? "Please sign in again."
      : status === 403
        ? "Customer access is required to use favorites."
        : status === 409
          ? "You have reached the maximum number of favorite dishes."
          : status === 502
            ? "Craves received an invalid favorites response."
            : "Favorites are temporarily unavailable.";

  return NextResponse.json({
    error: status === 400
      ? "INVALID_MENU_ITEM"
      : status === 401
        ? "SESSION_REQUIRED"
        : status === 403
          ? "CUSTOMER_ROLE_REQUIRED"
          : status === 409
            ? "FAVORITES_LIMIT_REACHED"
            : status === 502
              ? "INVALID_FAVORITES_RESPONSE"
              : "FAVORITES_UNAVAILABLE",
    message,
  }, { status });
}

async function menuItemIdFrom(
  context: { params: Promise<{ menuItemId: string }> },
): Promise<string | null> {
  const { menuItemId } = await context.params;
  return isUuid(menuItemId) ? menuItemId : null;
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ menuItemId: string }> },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({
      error: "ORIGIN_REJECTED",
      message: "Invalid favorites request origin.",
    }, { status: 403 });
  }

  const menuItemId = await menuItemIdFrom(context);
  if (!menuItemId) return failure(400);

  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/customer/favorites/${menuItemId}`,
      { method: "PUT" },
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return failure(upstream.status);

    const favorite = parseCustomerFavorite(body);
    return favorite
      ? NextResponse.json(favorite, { headers: { "Cache-Control": "no-store" } })
      : failure(502);
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401)
      : failure(503);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ menuItemId: string }> },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({
      error: "ORIGIN_REJECTED",
      message: "Invalid favorites request origin.",
    }, { status: 403 });
  }

  const menuItemId = await menuItemIdFrom(context);
  if (!menuItemId) return failure(400);

  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/customer/favorites/${menuItemId}`,
      { method: "DELETE" },
    );
    if (!upstream.ok) return failure(upstream.status);

    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401)
      : failure(503);
  }
}
