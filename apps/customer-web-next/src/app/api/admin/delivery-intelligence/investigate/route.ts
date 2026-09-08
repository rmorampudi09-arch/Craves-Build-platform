import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseDeliveryInvestigation } from "@/lib/admin-delivery-intelligence-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(10).max(500)
});

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ code: "CROSS_ORIGIN_REQUEST_REJECTED" }, { status: 403 });
  }
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ code: "INVALID_DELIVERY_INVESTIGATION_REQUEST" }, { status: 400 });
  }

  const correlationId = randomUUID();
  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/admin/operations/delivery-intelligence/orders/${input.data.orderId}`,
      { headers: { "X-Admin-Reason": input.data.reason, "X-Correlation-ID": correlationId } },
      15_000
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const code = upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 403 ? "ADMIN_ACCESS_REQUIRED" : upstream.status === 404 ? "DELIVERY_ACTIVITY_NOT_FOUND" : "DELIVERY_INVESTIGATION_FAILED";
      return NextResponse.json({ code }, { status: upstream.status, headers: { "Cache-Control": "no-store", "X-Correlation-ID": correlationId } });
    }
    const echoed = upstream.headers.get("X-Correlation-ID")?.trim();
    if (echoed && echoed !== correlationId) {
      return NextResponse.json({ code: "INVESTIGATION_CORRELATION_MISMATCH" }, { status: 502, headers: { "Cache-Control": "no-store", "X-Correlation-ID": correlationId } });
    }
    const parsed = parseDeliveryInvestigation(body);
    return parsed
      ? NextResponse.json({ ...parsed, correlationId }, { headers: { "Cache-Control": "no-store", "X-Correlation-ID": correlationId } })
      : NextResponse.json({ code: "INVALID_DELIVERY_INVESTIGATION_RESPONSE" }, { status: 502, headers: { "Cache-Control": "no-store", "X-Correlation-ID": correlationId } });
  } catch (error) {
    return NextResponse.json(
      { code: error instanceof SessionRequiredError ? "AUTHENTICATION_REQUIRED" : "DELIVERY_INVESTIGATION_UNAVAILABLE" },
      { status: error instanceof SessionRequiredError ? 401 : 503, headers: { "Cache-Control": "no-store", "X-Correlation-ID": correlationId } }
    );
  }
}
