import { NextRequest, NextResponse } from "next/server";
import { parseLocationRecommendation } from "@/lib/address-contract";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("latitude"));
  const longitude = Number(request.nextUrl.searchParams.get("longitude"));
  const matchRadiusMeters = Number(request.nextUrl.searchParams.get("matchRadiusMeters") ?? "100");
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isInteger(matchRadiusMeters) || matchRadiusMeters < 1 || matchRadiusMeters > 100_000) {
    return NextResponse.json({ error: "INVALID_LOCATION", message: "Valid location coordinates and match radius are required." }, { status: 400 });
  }
  const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), matchRadiusMeters: String(matchRadiusMeters) });
  try {
    const upstream = await authenticatedApiFetch(request, `/customer/addresses/recommendation?${query}`);
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return NextResponse.json({ error: upstream.status === 401 ? "SESSION_REQUIRED" : "RECOMMENDATION_FAILED", message: upstream.status === 401 ? "Please sign in again." : "Location recommendation failed." }, { status: upstream.status });
    const recommendation = parseLocationRecommendation(body);
    return recommendation ? NextResponse.json(recommendation, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Location recommendation response validation failed." }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ error: "SESSION_REQUIRED", message: "Please sign in again." }, { status: 401 });
    return NextResponse.json({ error: "RECOMMENDATION_UNAVAILABLE", message: "Location recommendation is unavailable." }, { status: 502 });
  }
}
