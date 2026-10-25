import { NextRequest, NextResponse } from "next/server";
import { publicApiFetch } from "@/shared/lib/public-api";
import { isUuid } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** The catalog's own upload limit for banner art. */
const MAX_BYTES = 2 * 1024 * 1024;

const failure = (status: number, code: string) =>
  NextResponse.json({ code }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ bannerId: string }> },
) {
  const { bannerId } = await context.params;
  if (!isUuid(bannerId)) return failure(400, "INVALID_BANNER_ID");
  try {
    const upstream = await publicApiFetch(`/catalog/banners/${bannerId.toLowerCase()}/image`, {
      headers: { Accept: [...IMAGE_TYPES].join(", ") },
    });
    // The catalog answers 404 for a banner that is missing or unpublished.
    if (upstream.status === 404) return failure(404, "BANNER_NOT_FOUND");
    if (!upstream.ok) return failure(503, "BANNER_IMAGE_UNAVAILABLE");
    const type = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const bytes = await upstream.arrayBuffer();
    if (!type || !IMAGE_TYPES.has(type) || bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
      return failure(502, "INVALID_BANNER_IMAGE");
    }
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return failure(503, "BANNER_IMAGE_UNAVAILABLE");
  }
}
