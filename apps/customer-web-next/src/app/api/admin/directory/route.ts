import { NextRequest, NextResponse } from "next/server";
import { parseAdminDirectorySearch, parseChefCase, parseCustomerCase } from "@/lib/admin-directory-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.replace(/[\r\n]+/g, " ").trim();
  return result && result.length <= max ? result : null;
}

function statusCode(status: number): string {
  if (status === 401) return "SESSION_EXPIRED";
  if (status === 403) return "ADMIN_ACCESS_REQUIRED";
  if (status === 404) return "DIRECTORY_RECORD_NOT_FOUND";
  if (status === 400) return "INVALID_DIRECTORY_REQUEST";
  return "DIRECTORY_UNAVAILABLE";
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "CROSS_ORIGIN_REQUEST_REJECTED" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = safeText(body?.action, 30);
  const reason = safeText(body?.reason, 500);
  if (!reason || reason.length < 10) return NextResponse.json({ code: "ADMIN_REASON_REQUIRED" }, { status: 400 });

  try {
    let upstream: Response;
    let parser: (value: unknown) => unknown | null;
    if (action === "search") {
      const query = safeText(body?.query, 255);
      if (!query) return NextResponse.json({ code: "DIRECTORY_QUERY_REQUIRED" }, { status: 400 });
      upstream = await authenticatedApiFetch(request, "/admin/directory/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Reason": reason },
        body: JSON.stringify({ query })
      }, 12_000);
      parser = parseAdminDirectorySearch;
    } else if (action === "customer-case" || action === "chef-case") {
      const identityId = safeText(body?.identityId, 64);
      if (!identityId || !UUID.test(identityId)) return NextResponse.json({ code: "DIRECTORY_IDENTITY_INVALID" }, { status: 400 });
      upstream = await authenticatedApiFetch(request, `/admin/directory/${action === "customer-case" ? "customers" : "chefs"}/${identityId}`, {
        headers: { "X-Admin-Reason": reason }
      }, 12_000);
      parser = action === "customer-case" ? parseCustomerCase : parseChefCase;
    } else {
      return NextResponse.json({ code: "DIRECTORY_ACTION_INVALID" }, { status: 400 });
    }

    const upstreamBody = await upstream.json().catch(() => null);
    if (!upstream.ok) return NextResponse.json({ code: statusCode(upstream.status) }, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    const parsed = parser(upstreamBody);
    if (!parsed) return NextResponse.json({ code: "INVALID_DIRECTORY_RESPONSE" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(parsed, { headers: { "Cache-Control": "no-store", "X-Correlation-ID": upstream.headers.get("X-Correlation-ID") ?? "" } });
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    return NextResponse.json({ code: "DIRECTORY_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
