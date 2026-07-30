import { NextRequest, NextResponse } from "next/server";
import { parseChefOrder } from "@/lib/chef-order-contract";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function apiBaseUrl(): string { const value = process.env.CRAVES_API_BASE_URL?.trim(); if (!value?.startsWith("https://")) throw new Error("CRAVES_API_BASE_URL must use HTTPS"); return value.replace(/\/$/, ""); }
function sameOrigin(request: NextRequest): boolean { const origin = request.headers.get("origin"); if (!origin) return false; try { const supplied = new URL(origin); const current = new URL(request.url); return supplied.protocol === current.protocol && supplied.host === current.host; } catch { return false; } }

export async function POST(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 });
  const { orderId } = await context.params;
  if (!UUID.test(orderId)) return NextResponse.json({ code: "INVALID_ORDER_ID" }, { status: 400 });
  const raw = await request.json().catch(() => null) as { reason?: unknown; actionId?: unknown } | null;
  const reason = typeof raw?.reason === "string" && raw.reason.trim() ? raw.reason.trim().slice(0, 500) : null;
  const actionId = typeof raw?.actionId === "string" ? raw.actionId : "";
  if (!UUID.test(actionId)) return NextResponse.json({ code: "INVALID_REJECTION_REQUEST" }, { status: 400 });
  const token = request.cookies.get("craves_access_token")?.value;
  if (!token) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const upstream = await fetch(`${apiBaseUrl()}/chef/orders/${encodeURIComponent(orderId)}/reject`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", "X-Correlation-ID": actionId, "Idempotency-Key": actionId }, body: JSON.stringify({ reason }), cache: "no-store", signal: controller.signal });
    if (!upstream.ok) { const response = NextResponse.json({ code: upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 409 ? "CHEF_REJECTION_CONFLICT" : "CHEF_REJECTION_FAILED" }, { status: upstream.status }); if (upstream.status === 401) response.cookies.delete("craves_access_token"); return response; }
    const order = parseChefOrder(await upstream.json().catch(() => null));
    if (!order) return NextResponse.json({ code: "INVALID_CHEF_ORDER_RESPONSE" }, { status: 502 });
    const response = NextResponse.json(order); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (error) { const timedOut = error instanceof Error && error.name === "AbortError"; return NextResponse.json({ code: timedOut ? "CHEF_REJECTION_TIMEOUT" : "CHEF_REJECTION_UNAVAILABLE" }, { status: timedOut ? 504 : 503 }); }
  finally { clearTimeout(timeout); }
}
