import { NextResponse } from "next/server";
import { parsePublicSubscriptionPlans } from "@/features/meal-plans/lib/subscription-contract";
import { publicApiFetch } from "@/shared/lib/public-api";
import { apiBaseUrl } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const SUBSCRIPTION_UPSTREAM_TIMEOUT_MS = 30_000;

function coordinate(value: string | null, limit: number): number | null {
  const parsed = value?.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // Without a location the server lists every plan (plan names for My plans); with one, only chefs nearby.
  const located = params.has("latitude") || params.has("longitude");
  const latitude = coordinate(params.get("latitude"), 90);
  const longitude = coordinate(params.get("longitude"), 180);
  if (located && (latitude === null || longitude === null))
    return NextResponse.json({ code: "INVALID_LOCATION" }, { status: 400 });
  const near = located ? `?latitude=${latitude}&longitude=${longitude}` : "";
  try {
    const upstream = await publicApiFetch(
      `/subscriptions/plans${near}`,
      {},
      SUBSCRIPTION_UPSTREAM_TIMEOUT_MS,
    );
    if (!upstream.ok)
      return NextResponse.json(
        { code: "SUBSCRIPTION_PLANS_UNAVAILABLE" },
        { status: upstream.status },
      );
    const plans = parsePublicSubscriptionPlans(await upstream.json().catch(() => null), apiBaseUrl());
    if (!plans)
      return NextResponse.json({ code: "INVALID_SUBSCRIPTION_PLANS_RESPONSE" }, { status: 502 });
    return NextResponse.json(plans, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { code: timedOut ? "SUBSCRIPTION_PLANS_TIMEOUT" : "SUBSCRIPTION_PLANS_UNAVAILABLE" },
      { status: timedOut ? 504 : 503 },
    );
  }
}
