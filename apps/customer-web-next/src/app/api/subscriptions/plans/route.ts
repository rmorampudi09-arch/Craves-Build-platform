import { NextResponse } from "next/server";
import { parsePublicSubscriptionPlans } from "@/features/meal-plans/lib/subscription-contract";
import { publicApiFetch } from "@/shared/lib/public-api";
import { apiBaseUrl } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const SUBSCRIPTION_UPSTREAM_TIMEOUT_MS = 30_000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("latitude"));
  const longitude = Number(params.get("longitude"));
  const near =
    params.has("latitude") &&
    params.has("longitude") &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
      ? `?latitude=${latitude}&longitude=${longitude}`
      : "";
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
