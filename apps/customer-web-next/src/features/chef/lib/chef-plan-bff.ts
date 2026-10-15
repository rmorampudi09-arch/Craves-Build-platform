// Server side of the meal-plan and daily-limit BFF routes.
import { NextRequest, NextResponse } from "next/server";
import { FEATURE_NOT_AVAILABLE, upstreamFailure } from "@/shared/lib/feature-availability";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
import { chefUpstream } from "./chef-errors";

export const NO_STORE = { "Cache-Control": "no-store" };

export const planReply = (status: number, body: unknown) =>
  NextResponse.json(body, { status, headers: NO_STORE });

/**
 * An upstream failure. A 403 stays CHEF_ACCESS_REQUIRED so the browser re-reads chef roles once; a route the
 * gateway doesn't have reads FEATURE_NOT_AVAILABLE (Coming soon); the backend's own sentence is kept for the chef.
 */
export function planFailure(status: number, body: unknown, fallback: string) {
  const mapped = upstreamFailure(status, body, fallback);
  const text = (body as { message?: unknown } | null)?.message;
  const message =
    mapped.code !== FEATURE_NOT_AVAILABLE && typeof text === "string" && text.length <= 300
      ? text
      : undefined;
  return planReply(mapped.status, {
    code: status === 403 ? "CHEF_ACCESS_REQUIRED" : mapped.code,
    ...(message && { message }),
    ...chefUpstream(body),
  });
}

/** The upstream call itself failed: signed out, or Craves didn't answer in time. */
export function planUnreachable(error: unknown, code: string) {
  if (error instanceof SessionRequiredError) return planReply(401, { code: "SESSION_EXPIRED" });
  return error instanceof Error && error.name === "AbortError"
    ? planReply(504, { code: "MEAL_PLAN_TIMEOUT" })
    : planReply(503, { code });
}

/** One daily-limit PUT: checked input in, the saved rule or date change checked on the way back. */
export async function capacityPut<T>(
  request: NextRequest,
  path: string,
  parseInput: (value: unknown) => T | null,
  parseSaved: (value: unknown) => unknown,
  invalidCode: string,
  failureCode: string,
) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return planReply(403, { code: "ORIGIN_REJECTED" });
  const input = parseInput(await bounded.json().catch(() => null));
  if (!input) return planReply(400, { code: invalidCode });
  try {
    const upstream = await authenticatedApiFetch(bounded, path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return planFailure(upstream.status, body, failureCode);
    const saved = parseSaved(body);
    return saved ? planReply(200, saved) : planReply(502, { code: "INVALID_CAPACITY_RESPONSE" });
  } catch (error) {
    return planUnreachable(error, "CAPACITY_UNAVAILABLE");
  }
}
