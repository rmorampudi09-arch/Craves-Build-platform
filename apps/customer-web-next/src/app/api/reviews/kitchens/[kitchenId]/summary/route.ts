import { NextRequest, NextResponse } from "next/server";

import { parseKitchenReviewSummary } from "@/lib/review-summary-contract";
import { publicApiFetch } from "@/lib/public-api";
import { isUuid } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ kitchenId: string }> },
) {
  void _request;
  const { kitchenId } = await context.params;
  if (!isUuid(kitchenId)) {
    return NextResponse.json(
      { code: "INVALID_KITCHEN_ID" },
      { status: 400 },
    );
  }

  try {
    const upstream = await publicApiFetch(
      "/public/kitchens/" + kitchenId + "/reviews/summary",
      {},
      4_000,
    );

    if (!upstream.ok) {
      return new NextResponse(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const summary = parseKitchenReviewSummary(
      await upstream.json().catch(() => null),
    );
    if (!summary || summary.kitchenId !== kitchenId) {
      return new NextResponse(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
