import { NextRequest, NextResponse } from "next/server";
import {
  isServiceDate,
  parseChefOverrideUpdate,
  parseChefScheduleOverride,
} from "@/features/chef/lib/chef-schedule-contract";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ date: string }> };

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

/** A date with nothing set answers 404 SCHEDULE_OVERRIDE_NOT_FOUND, which the screen reads as "no special day". */
async function call(request: NextRequest, date: string, init?: RequestInit) {
  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/kitchens/me/schedule/overrides/${date}`,
      init,
    );
    if (upstream.status === 204) return new NextResponse(null, { status: 204, headers });
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "SCHEDULE_OVERRIDE_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const override = parseChefScheduleOverride(body);
    return override
      ? NextResponse.json(override, { headers })
      : failure(502, "INVALID_SCHEDULE_OVERRIDE_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "SESSION_EXPIRED")
      : failure(503, "SCHEDULE_OVERRIDE_UNAVAILABLE");
  }
}

export async function GET(request: NextRequest, context: Context) {
  const { date } = await context.params;
  return isServiceDate(date) ? call(request, date) : failure(400, "INVALID_SERVICE_DATE");
}

export async function PUT(request: NextRequest, context: Context) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const { date } = await context.params;
  if (!isServiceDate(date)) return failure(400, "INVALID_SERVICE_DATE");
  const update = parseChefOverrideUpdate(await bounded.json().catch(() => null));
  if (!update) return failure(400, "INVALID_SCHEDULE_OVERRIDE");
  return call(bounded, date, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) return failure(403, "ORIGIN_REJECTED");
  const { date } = await context.params;
  return isServiceDate(date)
    ? call(request, date, { method: "DELETE" })
    : failure(400, "INVALID_SERVICE_DATE");
}
