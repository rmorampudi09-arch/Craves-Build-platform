import { NextRequest } from "next/server";
import { authenticatedApiFetch } from "@/shared/lib/server-api";
import { planFailure, planReply, planUnreachable } from "@/features/chef/lib/chef-plan-bff";
import { parseChefCapacitySummary } from "@/features/chef/lib/chef-subscription-capacity-contract";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/chef/subscription-capacity");
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return planFailure(upstream.status, body, "CAPACITY_REQUEST_FAILED");
    const summary = parseChefCapacitySummary(body);
    return summary ? planReply(200, summary) : planReply(502, { code: "INVALID_CAPACITY_RESPONSE" });
  } catch (error) {
    return planUnreachable(error, "CAPACITY_UNAVAILABLE");
  }
}
