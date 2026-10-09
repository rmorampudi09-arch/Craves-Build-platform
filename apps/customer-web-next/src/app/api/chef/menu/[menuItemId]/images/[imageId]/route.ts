import { boundedFetch } from "@/lib/bounded-fetch";
import { boundBffRequest } from "@/lib/bff-request-limits";
import { isSameOrigin } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { parseChefMenuItem } from "@/lib/chef-menu-contract";
import { chefMenuFailure } from "@/lib/chef-menu-errors";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ menuItemId: string; imageId: string }> };
function apiBaseUrl(): string { const value = process.env.CRAVES_API_BASE_URL?.trim(); if (!value?.startsWith("https://")) throw new Error("CRAVES_API_BASE_URL must use HTTPS"); return value.replace(/\/$/, ""); }

/** DELETE removes a saved dish photo; PUT makes it the cover. Both return the updated dish. */
async function forward(request: NextRequest, context: Context, method: "DELETE" | "PUT") {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  request = bounded;

  if (!isSameOrigin(request)) return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 });
  const { menuItemId, imageId } = await context.params;
  if (!UUID.test(menuItemId) || !UUID.test(imageId)) return NextResponse.json({ code: "INVALID_MENU_IMAGE_ID" }, { status: 400 });
  const token = request.cookies.get("craves_access_token")?.value;
  if (!token) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const path = `/kitchens/me/menu-items/${encodeURIComponent(menuItemId)}/images/${encodeURIComponent(imageId)}${method === "PUT" ? "/primary" : ""}`;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await boundedFetch(`${apiBaseUrl()}${path}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: controller.signal }, 40_000);
    if (!upstream.ok) {
      const failure = chefMenuFailure(upstream.status, await upstream.json().catch(() => null));
      const response = NextResponse.json(failure ?? { code: upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 404 ? "MENU_IMAGE_NOT_FOUND" : "MENU_IMAGE_UPDATE_FAILED" }, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
      if (upstream.status === 401) response.cookies.delete("craves_access_token");
      return response;
    }
    const item = parseChefMenuItem(await upstream.json().catch(() => null));
    if (!item) return NextResponse.json({ code: "INVALID_MENU_RESPONSE" }, { status: 502 });
    const response = NextResponse.json(item); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (error) { const timedOut = error instanceof Error && error.name === "AbortError"; return NextResponse.json({ code: timedOut ? "MENU_IMAGE_TIMEOUT" : "MENU_IMAGE_UNAVAILABLE" }, { status: timedOut ? 504 : 503 }); }
  finally { clearTimeout(timeout); }
}

export function DELETE(request: NextRequest, context: Context) { return forward(request, context, "DELETE"); }
export function PUT(request: NextRequest, context: Context) { return forward(request, context, "PUT"); }
