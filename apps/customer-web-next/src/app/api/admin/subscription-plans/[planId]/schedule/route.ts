import { NextRequest, NextResponse } from "next/server";
import { parseAdminSchedule, parseAdminScheduleInput } from "@/lib/admin-subscription-runtime-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

function error(status: number) {
  return NextResponse.json({ code: status === 401 ? "SESSION_EXPIRED" : status === 403 ? "ADMIN_ACCESS_REQUIRED" : status === 404 ? "PLAN_SCHEDULE_NOT_FOUND" : status === 409 ? "PLAN_SCHEDULE_CONFLICT" : "PLAN_SCHEDULE_FAILED" }, { status });
}

export async function GET(request: NextRequest, context: { params: Promise<{ planId: string }> }) {
  const { planId } = await context.params;
  if (!isUuid(planId)) return NextResponse.json({ code: "INVALID_PLAN_ID" }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, `/admin/subscription-plans/${planId}/schedule`);
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return error(upstream.status);
    const schedule = parseAdminSchedule(body);
    return schedule ? NextResponse.json(schedule, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ code: "INVALID_PLAN_SCHEDULE_RESPONSE" }, { status: 502 });
  } catch (caught) {
    if (caught instanceof SessionRequiredError) return error(401);
    return NextResponse.json({ code: "SUBSCRIPTION_UNAVAILABLE" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ planId: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 });
  const { planId } = await context.params;
  if (!isUuid(planId)) return NextResponse.json({ code: "INVALID_PLAN_ID" }, { status: 400 });
  const input = parseAdminScheduleInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ code: "INVALID_PLAN_SCHEDULE_INPUT" }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, `/admin/subscription-plans/${planId}/schedule`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return error(upstream.status);
    const schedule = parseAdminSchedule(body);
    return schedule ? NextResponse.json(schedule, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ code: "INVALID_PLAN_SCHEDULE_RESPONSE" }, { status: 502 });
  } catch (caught) {
    if (caught instanceof SessionRequiredError) return error(401);
    return NextResponse.json({ code: "SUBSCRIPTION_UNAVAILABLE" }, { status: 503 });
  }
}
