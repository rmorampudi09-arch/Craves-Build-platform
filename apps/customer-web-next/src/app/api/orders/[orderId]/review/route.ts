import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseOrderReview } from "@/lib/order-review-contract";
import { serverApiFetch, isUuid } from "@/lib/server-api";

export async function GET(_: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!isUuid(orderId)) {
    return NextResponse.json({ code: "INVALID_ORDER_ID", message: "A valid order id is required." }, { status: 400 });
  }
  const sessionCookies = await cookies();
  const accessToken = sessionCookies.get("craves_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ code: "AUTHENTICATION_REQUIRED", message: "Sign in to access reviews." }, { status: 401 });
  }
  const upstream = await serverApiFetch(`/api/v1/orders/${orderId}/review`, {
    method: "GET",
    accessToken,
    cache: "no-store",
  });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(body, { status: upstream.status });
  }
  const parsed = parseOrderReview(body);
  if (!parsed) {
    return NextResponse.json({ code: "INVALID_UPSTREAM_RESPONSE", message: "Review response validation failed." }, { status: 502 });
  }
  return NextResponse.json(parsed, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!isUuid(orderId)) {
    return NextResponse.json({ code: "INVALID_ORDER_ID", message: "A valid order id is required." }, { status: 400 });
  }
  const sessionCookies = await cookies();
  const accessToken = sessionCookies.get("craves_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ code: "AUTHENTICATION_REQUIRED", message: "Sign in to submit a review." }, { status: 401 });
  }
  const payload = await request.json().catch(() => null);
  const upstream = await serverApiFetch(`/api/v1/orders/${orderId}/review`, {
    method: "POST",
    accessToken,
    cache: "no-store",
    body: JSON.stringify(payload ?? {}),
    headers: { "Content-Type": "application/json" },
  });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(body, { status: upstream.status });
  }
  const parsed = parseOrderReview(body);
  if (!parsed) {
    return NextResponse.json({ code: "INVALID_UPSTREAM_RESPONSE", message: "Review response validation failed." }, { status: 502 });
  }
  return NextResponse.json(parsed, { status: 201, headers: { "Cache-Control": "no-store" } });
}
