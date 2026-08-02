import { NextRequest, NextResponse } from "next/server";
import { parseCart } from "@/lib/cart-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

function errorResponse(status: number) {
  if (status === 401) return NextResponse.json({ error: "SESSION_REQUIRED", message: "Please sign in to use your cart." }, { status });
  return NextResponse.json({ error: "CART_REQUEST_FAILED", message: "Cart request could not be completed." }, { status });
}

async function forward(request: NextRequest, method: "GET" | "DELETE") {
  if (method === "DELETE" && !isSameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED", message: "Invalid cart request origin." }, { status: 403 });
  try {
    const upstream = await authenticatedApiFetch(request, "/cart", { method });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return errorResponse(upstream.status);
    const cart = parseCart(body);
    return cart ? NextResponse.json(cart, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Cart response validation failed." }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return errorResponse(401);
    return NextResponse.json({ error: "CART_UNAVAILABLE", message: "Your cart is unavailable right now." }, { status: 502 });
  }
}

export async function GET(request: NextRequest) { return forward(request, "GET"); }
export async function DELETE(request: NextRequest) { return forward(request, "DELETE"); }
