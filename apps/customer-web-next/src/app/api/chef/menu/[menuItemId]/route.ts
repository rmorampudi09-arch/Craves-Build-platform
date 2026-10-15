import { chefUpstream } from "@/features/chef/lib/chef-errors";
import { boundedFetch } from "@/shared/lib/bounded-fetch";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { isSameOrigin } from "@/shared/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { parseChefMenuItem, parseChefMenuItemInput } from "@/features/chef/lib/chef-menu-contract";
import { chefMenuFailure } from "@/features/chef/lib/chef-menu-errors";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function apiBaseUrl(): string { const value = process.env.CRAVES_API_BASE_URL?.trim(); if (!value?.startsWith("https://")) throw new Error("CRAVES_API_BASE_URL must use HTTPS"); return value.replace(/\/$/, ""); }

export async function PUT(request: NextRequest, context: { params: Promise<{ menuItemId: string }> }) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  request = bounded;

  if (!isSameOrigin(request)) return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 });
  const { menuItemId } = await context.params;
  if (!UUID.test(menuItemId)) return NextResponse.json({ code: "INVALID_MENU_ITEM_ID" }, { status: 400 });
  const input = parseChefMenuItemInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ code: "INVALID_MENU_ITEM" }, { status: 400 });
  const token = request.cookies.get("craves_access_token")?.value;
  if (!token) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await boundedFetch(`${apiBaseUrl()}/kitchens/me/menu-items/${encodeURIComponent(menuItemId)}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store", signal: controller.signal }, 40_000);
    if (!upstream.ok) {
      const raw: unknown = await upstream.json().catch(() => null);
      const failure = chefMenuFailure(upstream.status, raw);
      const response = NextResponse.json(failure ?? { code: upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 404 ? "MENU_ITEM_NOT_FOUND" : "MENU_ITEM_UPDATE_FAILED", ...chefUpstream(raw) }, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
      if (upstream.status === 401) response.cookies.delete("craves_access_token");
      return response;
    }
    const item = parseChefMenuItem(await upstream.json().catch(() => null));
    if (!item) return NextResponse.json({ code: "INVALID_MENU_RESPONSE" }, { status: 502 });
    const response = NextResponse.json(item); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (error) { const timedOut = error instanceof Error && error.name === "AbortError"; return NextResponse.json({ code: timedOut ? "MENU_TIMEOUT" : "MENU_UNAVAILABLE" }, { status: timedOut ? 504 : 503 }); }
  finally { clearTimeout(timeout); }
}

/** Archives the dish (catalog answers 204). Not on the gateway yet: a bare 404 becomes FEATURE_NOT_AVAILABLE. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ menuItemId: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  if (!isSameOrigin(request)) return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403, headers });
  const { menuItemId } = await context.params;
  if (!isUuid(menuItemId)) return NextResponse.json({ code: "INVALID_MENU_ITEM_ID" }, { status: 400, headers });
  try {
    const upstream = await authenticatedApiFetch(request, `/kitchens/me/menu-items/${menuItemId}`, { method: "DELETE" });
    if (upstream.ok) return new NextResponse(null, { status: 204, headers });
    const { status, code } = upstreamFailure(upstream.status, await upstream.json().catch(() => null), "MENU_ITEM_DELETE_FAILED");
    return NextResponse.json({ code }, { status, headers });
  } catch (error) {
    return error instanceof SessionRequiredError
      ? NextResponse.json({ code: "SESSION_EXPIRED" }, { status: 401, headers })
      : NextResponse.json({ code: "MENU_UNAVAILABLE" }, { status: 503, headers });
  }
}
