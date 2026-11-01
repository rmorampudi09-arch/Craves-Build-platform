import { chefUpstream } from "@/features/chef/lib/chef-errors";
import { NextRequest, NextResponse } from "next/server";
import { isCanonicalUuid, parseChefOrderResponse } from "@/features/chef/lib/chef-order-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ code, ...extra }, { status, headers });
}

/** The chef gave the bag to the courier. No body: the server stamps the time. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  if (!isSameOrigin(request)) return failure(403, "ORIGIN_REJECTED");
  const { orderId } = await context.params;
  // Canonical, not RFC-versioned: older orders carry ids without version bits.
  if (!isCanonicalUuid(orderId)) return failure(400, "INVALID_ORDER_ID");
  try {
    const upstream = await authenticatedApiFetch(request, `/chef/orders/${orderId}/handed-over`, {
      method: "POST",
    });
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      // order-service answers unexpected failures with an empty 403: the message keeps that from reading as an access problem.
      const mapped = upstreamFailure(upstream.status, body, "CHEF_HANDED_OVER_FAILED");
      return failure(mapped.status, mapped.code, {
        message: "We couldn’t save that. Check your connection and try again.",
        ...chefUpstream(body),
      });
    }
    const order = parseChefOrderResponse(body);
    return order && order.id.toLowerCase() === orderId.toLowerCase()
      ? NextResponse.json(order, { headers })
      : failure(502, "INVALID_CHEF_ORDER_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "SESSION_EXPIRED")
      : failure(503, "CHEF_HANDED_OVER_UNAVAILABLE");
  }
}
