import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, safeReference, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ reference: string }> },
) {
  const { reference } = await context.params;
  const safe = safeReference(reference);
  if (!safe) {
    return NextResponse.json(
      { code: "INVALID_DELIVERY_REFERENCE" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const correlationId = crypto.randomUUID();
    const upstream = await authenticatedApiFetch(
      request,
      `/admin/operations/delivery-intelligence/orders/${encodeURIComponent(safe)}`,
      { headers: { "X-Correlation-ID": correlationId } },
      12_000,
    );
    const body = await upstream.json().catch(() => ({ code: "INVALID_UPSTREAM_RESPONSE" }));
    const responseCorrelation = upstream.headers.get("x-correlation-id") ?? correlationId;
    return NextResponse.json(body, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store", "X-Correlation-ID": responseCorrelation },
    });
  } catch (error) {
    if (error instanceof SessionRequiredError) {
      return NextResponse.json(
        { code: "AUTHENTICATION_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { code: "DELIVERY_INVESTIGATION_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
