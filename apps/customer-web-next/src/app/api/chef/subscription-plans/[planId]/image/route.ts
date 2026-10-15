import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { publicApiFetch } from "@/shared/lib/public-api";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, isUuid } from "@/shared/lib/server-api";
import {
  NO_STORE,
  planFailure,
  planReply,
  planUnreachable,
} from "@/features/chef/lib/chef-plan-bff";
import { parseChefMealPlan } from "@/features/chef/lib/chef-subscription-plan-contract";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ planId: string }> };

// subscription-service PlanImageValidator: JPEG or PNG (it can't check WebP), at most 2 MiB.
const TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_BYTES = 2_097_152;

/** The plan photo, read from the public plan image; ?v= changes with every upload, so it can be cached. */
export async function GET(request: NextRequest, context: Context) {
  const { planId } = await context.params;
  const version = request.nextUrl.searchParams.get("v");
  if (!isUuid(planId) || !version || !/^\d{1,15}$/.test(version))
    return planReply(400, { code: "INVALID_PLAN_IMAGE_REQUEST" });
  try {
    const upstream = await publicApiFetch(`/subscriptions/plans/${planId}/image?v=${version}`, {
      headers: { Accept: "image/jpeg, image/png" },
    });
    const type = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!upstream.ok || !TYPES.has(type))
      return new NextResponse(null, {
        status: upstream.status === 404 ? 404 : 502,
        headers: NO_STORE,
      });
    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 503, headers: NO_STORE });
  }
}

/** The server takes a photo only while the plan is a draft (or sent back for changes). */
export async function PUT(request: NextRequest, context: Context) {
  const bounded = await boundBffRequest(request, { maxBytes: MAX_BYTES + 64 * 1024 });
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return planReply(403, { code: "ORIGIN_REJECTED" });
  const { planId } = await context.params;
  if (!isUuid(planId)) return planReply(400, { code: "INVALID_PLAN_ID" });
  const form = await bounded.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !TYPES.has(file.type) || file.size < 1 || file.size > MAX_BYTES)
    return planReply(400, { code: "INVALID_PLAN_IMAGE" });
  const upstreamForm = new FormData();
  upstreamForm.set("file", file, file.name || `craves-plan-${planId}.jpg`);
  try {
    const upstream = await authenticatedApiFetch(
      bounded,
      `/chef/subscription-plans/${planId}/image`,
      { method: "PUT", body: upstreamForm },
      30_000,
    );
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return planFailure(upstream.status, body, "PLAN_IMAGE_UPLOAD_FAILED");
    const plan = parseChefMealPlan(body);
    return plan
      ? planReply(200, plan)
      : planReply(502, { code: "INVALID_CHEF_MEAL_PLAN_RESPONSE" });
  } catch (error) {
    return planUnreachable(error, "PLAN_IMAGE_UNAVAILABLE");
  }
}
