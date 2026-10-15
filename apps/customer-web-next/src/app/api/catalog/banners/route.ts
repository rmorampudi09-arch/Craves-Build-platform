import { NextResponse } from "next/server";
import { parseHomeBannerFeed } from "@/features/home/lib/home-banner-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { publicApiFetch } from "@/shared/lib/public-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const failure = (status: number, code: string) => NextResponse.json({ code }, { status, headers });

/** Home's promo banners: published only, in the admin's order, each with our own image route. */
export async function GET() {
  try {
    const upstream = await publicApiFetch("/catalog/banners");
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "BANNERS_UNAVAILABLE");
      return failure(mapped.status, mapped.code);
    }
    const banners = parseHomeBannerFeed(body);
    return banners
      ? NextResponse.json({ banners }, { headers })
      : failure(502, "INVALID_BANNERS_RESPONSE");
  } catch {
    return failure(503, "BANNERS_UNAVAILABLE");
  }
}
