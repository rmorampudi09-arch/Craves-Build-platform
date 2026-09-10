import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

function integer(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export async function GET(request: NextRequest) {
  const hours = integer(request.nextUrl.searchParams.get("hours"), 24, 1, 168);
  const limit = integer(request.nextUrl.searchParams.get("limit"), 30, 5, 100);
  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/admin/operations/delivery-intelligence/overview?hours=${hours}&limit=${limit}`,
      {},
      12_000,
    );
    const body = await upstream.json().catch(() => ({ code: "INVALID_UPSTREAM_RESPONSE" }));
    return NextResponse.json(body, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SessionRequiredError) {
      return NextResponse.json(
        { code: "AUTHENTICATION_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { code: "DELIVERY_INTELLIGENCE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
