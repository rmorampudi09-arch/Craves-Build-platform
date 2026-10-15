import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, isUuid } from "@/shared/lib/server-api";
import { planFailure, planReply, planUnreachable } from "@/features/chef/lib/chef-plan-bff";
import {
  parseChefMealPlan,
  parseSubmitNote,
} from "@/features/chef/lib/chef-subscription-plan-contract";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ planId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return planReply(403, { code: "ORIGIN_REJECTED" });
  const { planId } = await context.params;
  if (!isUuid(planId)) return planReply(400, { code: "INVALID_PLAN_ID" });
  // The note is optional, so an empty body is fine; a body that isn't JSON is not.
  const note = parseSubmitNote(
    await bounded
      .text()
      .then((text) => (text ? JSON.parse(text) : null))
      .catch(() => false),
  );
  if (note === undefined) return planReply(400, { code: "INVALID_SUBMIT_NOTE" });
  try {
    const upstream = await authenticatedApiFetch(
      bounded,
      `/chef/subscription-plans/${planId}/submit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      },
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return planFailure(upstream.status, body, "MEAL_PLAN_SUBMIT_FAILED");
    const plan = parseChefMealPlan(body);
    return plan
      ? planReply(200, plan)
      : planReply(502, { code: "INVALID_CHEF_MEAL_PLAN_RESPONSE" });
  } catch (error) {
    return planUnreachable(error, "MEAL_PLAN_SUBMIT_UNAVAILABLE");
  }
}
