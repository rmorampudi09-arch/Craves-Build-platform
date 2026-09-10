import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Preserve validated server-side bounds; do not silently replace malformed filters.
  const params = new URLSearchParams();
  for (const name of ["hours", "limit", "from", "to", "offset", "attentionOffset", "sort"]) {
    const value = request.nextUrl.searchParams.get(name);
    if (value !== null) params.set(name, value);
  }
  if (!params.has("hours")) params.set("hours", "0");
  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/admin/operations/delivery-intelligence/overview?${params}`,
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
