import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch } from "@/shared/lib/server-api";
import { planFailure, planReply, planUnreachable } from "@/features/chef/lib/chef-plan-bff";
import {
  parseChefMealPlan,
  parseChefMealPlanInput,
  parseChefMealPlans,
} from "@/features/chef/lib/chef-subscription-plan-contract";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/chef/subscription-plans");
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return planFailure(upstream.status, body, "CHEF_MEAL_PLAN_REQUEST_FAILED");
    const plans = parseChefMealPlans(body);
    return plans
      ? planReply(200, plans)
      : planReply(502, { code: "INVALID_CHEF_MEAL_PLANS_RESPONSE" });
  } catch (error) {
    return planUnreachable(error, "CHEF_MEAL_PLANS_UNAVAILABLE");
  }
}

export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return planReply(403, { code: "ORIGIN_REJECTED" });
  const input = parseChefMealPlanInput(await bounded.json().catch(() => null));
  if (!input) return planReply(400, { code: "INVALID_CHEF_MEAL_PLAN_INPUT" });
  try {
    const upstream = await authenticatedApiFetch(bounded, "/chef/subscription-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return planFailure(upstream.status, body, "CHEF_MEAL_PLAN_REQUEST_FAILED");
    const plan = parseChefMealPlan(body);
    return plan
      ? planReply(201, plan)
      : planReply(502, { code: "INVALID_CHEF_MEAL_PLAN_RESPONSE" });
  } catch (error) {
    return planUnreachable(error, "CHEF_MEAL_PLAN_UNAVAILABLE");
  }
}
