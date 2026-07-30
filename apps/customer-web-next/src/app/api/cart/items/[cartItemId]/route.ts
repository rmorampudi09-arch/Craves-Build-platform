import { NextRequest, NextResponse } from "next/server";
import { parseCart, parseQuantityInput } from "@/lib/cart-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

async function itemId(context: { params: Promise<{ cartItemId: string }> }): Promise<string | null> {
  const { cartItemId } = await context.params;
  return isUuid(cartItemId) ? cartItemId : null;
}

function failure(status: number) {
  if (status === 401) return NextResponse.json({ error: "SESSION_REQUIRED", message: "Please sign in to use your cart." }, { status });
  if (status === 404) return NextResponse.json({ error: "CART_ITEM_NOT_FOUND", message: "Cart item was not found." }, { status });
  return NextResponse.json({ error: "CART_UPDATE_FAILED", message: "Cart could not be updated." }, { status });
}

async function responseCart(upstream: Response) {
  const body = await upstream.json().catch(() => null);
  if (!upstream.ok) return failure(upstream.status);
  const cart = parseCart(body);
  return cart ? NextResponse.json(cart, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Cart response validation failed." }, { status: 502 });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ cartItemId: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED", message: "Invalid cart request origin." }, { status: 403 });
  const id = await itemId(context);
  if (!id) return NextResponse.json({ error: "INVALID_CART_ITEM_ID", message: "Cart item id is invalid." }, { status: 400 });
  const input = parseQuantityInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "INVALID_QUANTITY", message: "Quantity must be between 1 and 100." }, { status: 400 });
  try {
    return responseCart(await authenticatedApiFetch(request, `/cart/items/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
  } catch (error) {
    if (error instanceof SessionRequiredError) return failure(401);
    return NextResponse.json({ error: "CART_UNAVAILABLE", message: "Cart could not be updated right now." }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ cartItemId: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED", message: "Invalid cart request origin." }, { status: 403 });
  const id = await itemId(context);
  if (!id) return NextResponse.json({ error: "INVALID_CART_ITEM_ID", message: "Cart item id is invalid." }, { status: 400 });
  try {
    return responseCart(await authenticatedApiFetch(request, `/cart/items/${id}`, { method: "DELETE" }));
  } catch (error) {
    if (error instanceof SessionRequiredError) return failure(401);
    return NextResponse.json({ error: "CART_UNAVAILABLE", message: "Cart item could not be removed right now." }, { status: 502 });
  }
}
