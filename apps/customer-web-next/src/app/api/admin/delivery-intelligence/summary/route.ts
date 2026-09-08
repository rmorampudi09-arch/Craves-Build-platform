import { NextRequest, NextResponse } from "next/server";
import { parseDeliverySummary } from "@/lib/admin-delivery-intelligence-contract";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const value = Number(request.nextUrl.searchParams.get("windowHours") ?? "168");
  if (!Number.isInteger(value) || value < 1 || value > 720) {
    return NextResponse.json({ code: "INVALID_DELIVERY_WINDOW" }, { status: 400 });
  }

  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/admin/operations/delivery-intelligence/summary?windowHours=${value}`,
      {},
      15_000
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const code = upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 403 ? "ADMIN_ACCESS_REQUIRED" : "DELIVERY_INTELLIGENCE_UNAVAILABLE";
      return NextResponse.json({ code }, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    }
    const parsed = parseDeliverySummary(body);
    return parsed
      ? NextResponse.json(parsed, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ code: "INVALID_DELIVERY_INTELLIGENCE_RESPONSE" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { code: error instanceof SessionRequiredError ? "AUTHENTICATION_REQUIRED" : "DELIVERY_INTELLIGENCE_UNAVAILABLE" },
      { status: error instanceof SessionRequiredError ? 401 : 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
