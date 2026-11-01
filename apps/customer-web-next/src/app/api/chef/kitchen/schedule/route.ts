import { NextRequest, NextResponse } from "next/server";
import {
  parseChefKitchenSchedule,
  parseChefScheduleUpdate,
} from "@/features/chef/lib/chef-schedule-contract";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

async function call(request: NextRequest, init?: RequestInit) {
  try {
    const upstream = await authenticatedApiFetch(request, "/kitchens/me/schedule", init);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "KITCHEN_SCHEDULE_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const schedule = parseChefKitchenSchedule(body);
    return schedule
      ? NextResponse.json(schedule, { headers })
      : failure(502, "INVALID_KITCHEN_SCHEDULE_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "SESSION_EXPIRED")
      : failure(503, "KITCHEN_SCHEDULE_UNAVAILABLE");
  }
}

export async function GET(request: NextRequest) {
  return call(request);
}

/** Replaces the whole week and the pause: the screens send it back built on the schedule they just read. */
export async function PUT(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const update = parseChefScheduleUpdate(await bounded.json().catch(() => null));
  if (!update) return failure(400, "INVALID_KITCHEN_SCHEDULE");
  return call(bounded, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}
