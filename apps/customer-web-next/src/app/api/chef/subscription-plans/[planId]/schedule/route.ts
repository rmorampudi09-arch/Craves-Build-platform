import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, isUuid } from "@/shared/lib/server-api";
import { planFailure, planReply, planUnreachable } from "@/features/chef/lib/chef-plan-bff";
import {
  parseChefMealSchedule,
  parseChefMealScheduleInput,
} from "@/features/chef/lib/chef-subscription-plan-contract";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ planId: string }> };

// A 404 PLAN_SCHEDULE_NOT_FOUND means the plan has no meals yet.
export async function GET(request: NextRequest, context: Context) {
  const { planId } = await context.params;
  if (!isUuid(planId)) return planReply(400, { code: "INVALID_PLAN_ID" });
  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/chef/subscription-plans/${planId}/schedule`,
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok)
      return planFailure(upstream.status, body, "CHEF_MEAL_SCHEDULE_REQUEST_FAILED");
    const schedule = parseChefMealSchedule(body);
    return schedule
      ? planReply(200, schedule)
      : planReply(502, { code: "INVALID_CHEF_MEAL_SCHEDULE_RESPONSE" });
  } catch (error) {
    return planUnreachable(error, "CHEF_MEAL_SCHEDULE_UNAVAILABLE");
  }
}

export async function PUT(request: NextRequest, context: Context) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return planReply(403, { code: "ORIGIN_REJECTED" });
  const { planId } = await context.params;
  if (!isUuid(planId)) return planReply(400, { code: "INVALID_PLAN_ID" });
  const input = parseChefMealScheduleInput(await bounded.json().catch(() => null));
  if (!input) return planReply(400, { code: "INVALID_CHEF_MEAL_SCHEDULE_INPUT" });
  try {
    const upstream = await authenticatedApiFetch(
      bounded,
      `/chef/subscription-plans/${planId}/schedule`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok)
      return planFailure(upstream.status, body, "CHEF_MEAL_SCHEDULE_REQUEST_FAILED");
    const schedule = parseChefMealSchedule(body);
    return schedule
      ? planReply(200, schedule)
      : planReply(502, { code: "INVALID_CHEF_MEAL_SCHEDULE_RESPONSE" });
  } catch (error) {
    return planUnreachable(error, "CHEF_MEAL_SCHEDULE_UNAVAILABLE");
  }
}
