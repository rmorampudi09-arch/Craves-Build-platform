import { NextRequest, NextResponse } from "next/server";
import { parseAdminSubscriptionPlan, parseAdminSubscriptionPlanInput, parseAdminSubscriptionPlans } from "@/lib/admin-subscription-plan-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

function errorResponse(status: number) {
  return NextResponse.json({ code: status === 401 ? "SESSION_EXPIRED" : status === 403 ? "ADMIN_ACCESS_REQUIRED" : "ADMIN_PLAN_REQUEST_FAILED" }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/admin/subscription-plans");
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return errorResponse(upstream.status);
    const plans = parseAdminSubscriptionPlans(body);
    return plans ? NextResponse.json(plans, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ code: "INVALID_PLAN_RESPONSE" }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return errorResponse(401);
    return NextResponse.json({ code: "ADMIN_PLANS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 });
  const input = parseAdminSubscriptionPlanInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ code: "INVALID_PLAN_INPUT" }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, "/admin/subscription-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return errorResponse(upstream.status);
    const plan = parseAdminSubscriptionPlan(body);
    return plan ? NextResponse.json(plan, { status: 201, headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ code: "INVALID_PLAN_RESPONSE" }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return errorResponse(401);
    return NextResponse.json({ code: "ADMIN_PLAN_UNAVAILABLE" }, { status: 503 });
  }
}
