import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  isRating,
  isTagCode,
  orderServiceError,
  parseCustomerReview,
  REVIEW_TAGS_MAX,
  REVIEW_TEXT_MAX,
} from "@/features/orders/lib/review-contract";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ orderId: string }> };

const headers = { "Cache-Control": "no-store" };
const rating = z.number().refine(isRating);
const optionalRating = rating.nullable();
// Same limits as order-service ReviewValidation. Media is never sent from the web.
const submission = {
  overallRating: rating,
  foodTasteRating: optionalRating,
  portionValueRating: optionalRating,
  packagingRating: optionalRating,
  accuracyRating: optionalRating,
  chefPreparationRating: optionalRating,
  deliveryRating: optionalRating,
  reviewText: z.string().trim().max(REVIEW_TEXT_MAX).nullable().transform((text) => text || null),
  tagCodes: z
    .array(z.string().refine(isTagCode))
    .max(REVIEW_TAGS_MAX)
    .refine((codes) => new Set(codes).size === codes.length),
};
const createRequest = z.object(submission).strict();
const updateRequest = z.object({ ...submission, expectedVersion: z.number().int().min(1).max(2_147_483_647) }).strict();

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

async function forward(request: NextRequest, orderId: string, init?: RequestInit) {
  try {
    const upstream = await authenticatedApiFetch(request, `/orders/${orderId}/review`, init);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      // An empty 403 is order-service's answer to anything unexpected: it stays "something went wrong".
      const mapped = upstreamFailure(upstream.status, orderServiceError(body), "ORDER_REVIEW_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const review = parseCustomerReview(body);
    return review && review.orderId.toLowerCase() === orderId.toLowerCase()
      ? NextResponse.json(review, { status: init?.method === "POST" ? 201 : 200, headers })
      : failure(502, "INVALID_ORDER_REVIEW_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "ORDER_REVIEW_UNAVAILABLE");
  }
}

async function write(request: NextRequest, context: Context, method: "POST" | "PUT") {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const { orderId } = await context.params;
  if (!isUuid(orderId)) return failure(400, "INVALID_ORDER_ID");
  const input = (method === "POST" ? createRequest : updateRequest).safeParse(await bounded.json().catch(() => null));
  if (!input.success) return failure(400, "INVALID_ORDER_REVIEW_REQUEST");
  return forward(bounded, orderId, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input.data, mediaAssetIds: [] }),
  });
}

/** The customer's own review of a delivered order; 404 ORDER_REVIEW_NOT_FOUND until they rate it. */
export async function GET(request: NextRequest, context: Context) {
  const { orderId } = await context.params;
  return isUuid(orderId) ? forward(request, orderId) : failure(400, "INVALID_ORDER_ID");
}

export async function POST(request: NextRequest, context: Context) {
  return write(request, context, "POST");
}

/** Edits the review at `expectedVersion`; 409 ORDER_REVIEW_VERSION_CONFLICT when it changed meanwhile. */
export async function PUT(request: NextRequest, context: Context) {
  return write(request, context, "PUT");
}
