import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
import {
  adminReviewSchema, backendReviewPageSchema, kitchenListSchema, moderationRequestSchema, reviewTarget, type AdminReview,
} from "@/features/admin/reviews/lib/review-moderation-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
const failure = (status: number, message: string) => NextResponse.json({ message }, { status, headers });
class LimitError extends Error {}
async function boundedText(stream: ReadableStream<Uint8Array> | null, max: number): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > max) { await reader.cancel(); throw new LimitError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

function upstreamFailure(status: number) {
  return status === 401 ? failure(401, "Administrator session expired. Sign in again.")
    : status === 403 ? failure(403, "Only ADMIN or SUPPORT_ADMIN accounts can moderate reviews.")
      : status === 404 ? failure(404, "Review not found. Refresh the list.")
        : status === 409 ? failure(409, "This review changed. Refresh before deciding.")
          : status === 400 ? failure(400, "Order Service refused this decision. Check the reason and refresh.")
            : failure(503, "Review service is unavailable. Nothing was changed.");
}

/** Names from the public kitchen list; a kitchen outside it is shown by its short id instead. */
async function kitchenNames(request: NextRequest, items: AdminReview[]): Promise<Record<string, string>> {
  if (items.length === 0) return {};
  try {
    const response = await authenticatedApiFetch(request, "/catalog/kitchens", {}, 5_000, 1024 * 1024);
    if (!response.ok) { await response.body?.cancel(); return {}; }
    const parsed = kitchenListSchema.safeParse(await response.json());
    if (!parsed.success) return {};
    const wanted = new Set(items.map(item => item.kitchenId));
    return Object.fromEntries(parsed.data.kitchens.filter(kitchen => wanted.has(kitchen.id))
      .map(kitchen => [kitchen.id, (kitchen.kitchenName || kitchen.displayName || "").trim().slice(0, 120)])
      .filter(([, name]) => name));
  } catch { return {}; }
}

async function handle(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const target = reviewTarget(request.method, path, request.nextUrl.searchParams);
  if (!target) return failure(404, "Unknown review operation.");
  if (request.method !== "GET" && !isSameOrigin(request)) return failure(403, "Invalid request origin.");
  try {
    if (request.method === "PUT") {
      if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return failure(415, "JSON is required.");
      let input: unknown;
      try { input = JSON.parse(await boundedText(request.body, 2048)); } catch (error) {
        return error instanceof LimitError ? failure(413, "Review decision is too large.") : failure(400, "Invalid review request.");
      }
      const parsed = moderationRequestSchema.safeParse(input);
      if (!parsed.success) return failure(400, "Choose Publish, Hide or Reject and write a reason of 10 to 500 characters in English letters.");
      const upstream = await authenticatedApiFetch(request, target, {
        method: "PUT", body: JSON.stringify({ action: parsed.data.action }),
        headers: { "Content-Type": "application/json", "X-Admin-Reason": parsed.data.reason },
      }, 15_000, 256 * 1024);
      if (!upstream.ok) { await upstream.body?.cancel(); return upstreamFailure(upstream.status); }
      const review = adminReviewSchema.safeParse(await upstream.json().catch(() => null));
      return review.success ? NextResponse.json(review.data, { headers }) : failure(502, "Invalid review response. Refresh the list.");
    }
    const upstream = await authenticatedApiFetch(request, target, {}, 15_000, 1024 * 1024);
    if (!upstream.ok) { await upstream.body?.cancel(); return upstreamFailure(upstream.status); }
    const page = backendReviewPageSchema.safeParse(await upstream.json().catch(() => null));
    if (!page.success) return failure(502, "Invalid review list response.");
    return NextResponse.json({ ...page.data, kitchenNames: await kitchenNames(request, page.data.items) }, { headers });
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "Sign in with your administrator account.")
      : failure(503, "Review connection unavailable. Nothing was changed.");
  }
}
export { handle as GET, handle as PUT };
