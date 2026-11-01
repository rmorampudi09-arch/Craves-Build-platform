import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, isUuid } from "@/shared/lib/server-api";
import { planFailure, planReply, planUnreachable } from "@/features/chef/lib/chef-plan-bff";
import { parseChefMealPlan } from "@/features/chef/lib/chef-subscription-plan-contract";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ planId: string }> };

// A live plan stops (or starts again) taking new subscribers; current subscribers keep getting meals.
export async function PATCH(request: NextRequest, context: Context) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return planReply(403, { code: "ORIGIN_REJECTED" });
  const { planId } = await context.params;
  if (!isUuid(planId)) return planReply(400, { code: "INVALID_PLAN_ID" });
  const raw = (await bounded.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !raw ||
    typeof raw !== "object" ||
    Object.keys(raw).length !== 1 ||
    typeof raw.acceptingSubscribers !== "boolean"
  ) {
    return planReply(400, { code: "INVALID_ACCEPTING_SUBSCRIBERS" });
  }
  try {
    const upstream = await authenticatedApiFetch(
      bounded,
      `/chef/subscription-plans/${planId}/accepting-subscribers`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptingSubscribers: raw.acceptingSubscribers }),
      },
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return planFailure(upstream.status, body, "MEAL_PLAN_UPDATE_FAILED");
    const plan = parseChefMealPlan(body);
    return plan
      ? planReply(200, plan)
      : planReply(502, { code: "INVALID_CHEF_MEAL_PLAN_RESPONSE" });
  } catch (error) {
    return planUnreachable(error, "CHEF_MEAL_PLAN_UNAVAILABLE");
  }
}
