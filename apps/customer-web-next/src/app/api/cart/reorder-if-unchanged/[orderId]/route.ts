import { NextRequest, NextResponse } from "next/server";
import { parseCart } from "@/features/cart/lib/cart-contract";
import { parseReorderCartRequest } from "@/features/orders/lib/repeat-order-contract";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ orderId: string }> };

const headers = { "Cache-Control": "no-store" };
const failure = (status: number, code: string) => NextResponse.json({ code }, { status, headers });

/** Rebuilds the cart from a delivered order, only if the cart is still exactly the one the customer saw. */
export async function POST(request: NextRequest, context: Context) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  request = bounded;

  if (!isSameOrigin(request)) return failure(403, "ORIGIN_REJECTED");
  const { orderId } = await context.params;
  if (!isUuid(orderId)) return failure(400, "INVALID_ORDER_ID");
  const input = parseReorderCartRequest(await request.json().catch(() => null));
  if (!input) return failure(400, "INVALID_REORDER_REQUEST");
  try {
    const upstream = await authenticatedApiFetch(request, `/cart/reorder-if-unchanged/${orderId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await upstream.json().catch(() => null)) as {
      error?: unknown;
      code?: unknown;
    } | null;
    if (!upstream.ok) {
      // order-service names its errors in "error" (CART_CHANGED, CART_KITCHEN_CONFLICT, ORDER_NOT_FOUND…); an empty 403 is an unexpected failure, not a sign-out.
      const mapped = upstreamFailure(
        upstream.status,
        { code: body?.error ?? body?.code },
        "REORDER_FAILED",
      );
      return failure(mapped.status, mapped.code);
    }
    const cart = parseCart(body);
    return cart ? NextResponse.json(cart, { headers }) : failure(502, "INVALID_CART_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "SESSION_EXPIRED")
      : failure(503, "REORDER_UNAVAILABLE");
  }
}
