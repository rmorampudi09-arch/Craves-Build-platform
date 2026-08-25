import { NextRequest, NextResponse } from "next/server";
import { parseAdvancedSearchResponse } from "@/lib/advanced-search-contract";
import { publicApiFetch } from "@/lib/public-api";

function numeric(request: NextRequest, name: string, min: number, max: number, integer = false): number | null {
  const raw = request.nextUrl.searchParams.get(name);
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) return null;
  return value;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const latitude = numeric(request, "latitude", -90, 90);
  const longitude = numeric(request, "longitude", -180, 180);
  const radiusMeters = numeric(request, "radiusMeters", 1, 100_000, true);
  const page = numeric(request, "page", 0, 10_000, true) ?? 0;
  const size = numeric(request, "size", 1, 50, true) ?? 20;
  if (q.length < 2 || q.length > 120 || latitude === null || longitude === null || radiusMeters === null) {
    return NextResponse.json({ code: "INVALID_SEARCH_REQUEST" }, { status: 400 });
  }

  const query = new URLSearchParams({ q, latitude: String(latitude), longitude: String(longitude), radiusMeters: String(radiusMeters), page: String(page), size: String(size) });
  const foodType = request.nextUrl.searchParams.get("foodType");
  if (foodType === "VEG" || foodType === "NON_VEG") query.set("foodType", foodType);
  const category = request.nextUrl.searchParams.get("category")?.trim();
  if (category && category.length <= 80) query.set("category", category);
  const maxPrice = numeric(request, "maxPrice", 0.01, 1_000_000);
  if (maxPrice !== null) query.set("maxPrice", String(maxPrice));
  const maxPreparationMinutes = numeric(request, "maxPreparationMinutes", 1, 1_440, true);
  if (maxPreparationMinutes !== null) query.set("maxPreparationMinutes", String(maxPreparationMinutes));

  try {
    const upstream = await publicApiFetch(`/discovery/search?${query}`);
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return NextResponse.json({ code: "SEARCH_UNAVAILABLE" }, { status: upstream.status });
    const parsed = parseAdvancedSearchResponse(body);
    return parsed
      ? NextResponse.json(parsed, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ code: "INVALID_SEARCH_RESPONSE" }, { status: 502 });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ code: timeout ? "SEARCH_TIMEOUT" : "SEARCH_UNAVAILABLE" }, { status: timeout ? 504 : 502 });
  }
}
