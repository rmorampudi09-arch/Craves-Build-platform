import { NextRequest, NextResponse } from "next/server";
import { parseChefOrders } from "@/lib/chef-order-contract";

export const dynamic = "force-dynamic";
function apiBaseUrl(): string { const value = process.env.CRAVES_API_BASE_URL?.trim(); if (!value?.startsWith("https://")) throw new Error("CRAVES_API_BASE_URL must use HTTPS"); return value.replace(/\/$/, ""); }

export async function GET(request: NextRequest) {
  const token = request.cookies.get("craves_access_token")?.value;
  if (!token) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await fetch(`${apiBaseUrl()}/chef/orders`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    if (!upstream.ok) { const response = NextResponse.json({ code: upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 403 ? "CHEF_ACCESS_REQUIRED" : "CHEF_ORDERS_REQUEST_FAILED" }, { status: upstream.status }); if (upstream.status === 401) response.cookies.delete("craves_access_token"); return response; }
    const orders = parseChefOrders(await upstream.json().catch(() => null));
    if (!orders) return NextResponse.json({ code: "INVALID_CHEF_ORDERS_RESPONSE" }, { status: 502 });
    const response = NextResponse.json(orders); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (error) { const timedOut = error instanceof Error && error.name === "AbortError"; return NextResponse.json({ code: timedOut ? "CHEF_ORDERS_TIMEOUT" : "CHEF_ORDERS_UNAVAILABLE" }, { status: timedOut ? 504 : 503 }); }
  finally { clearTimeout(timeout); }
}
