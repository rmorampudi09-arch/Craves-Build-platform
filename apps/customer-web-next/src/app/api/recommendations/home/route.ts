import { NextRequest, NextResponse } from "next/server";
import { parseCustomerFavorites } from "@/lib/customer-favorites-contract";
import { parsePersonalisedRecommendations } from "@/lib/personalised-recommendations-contract";
import { publicApiFetch } from "@/lib/public-api";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

const MAX_SEEDS = 20;

export async function GET(request: NextRequest) {
  try {
    const favoritesResponse = await authenticatedApiFetch(request, "/customer/favorites");
    const favoritesBody = await favoritesResponse.json().catch(() => null);
    if (!favoritesResponse.ok) {
      return NextResponse.json({ code: favoritesResponse.status === 401 ? "SESSION_EXPIRED" : "RECOMMENDATIONS_UNAVAILABLE" }, { status: favoritesResponse.status });
    }
    const favorites = parseCustomerFavorites(favoritesBody);
    if (!favorites) return NextResponse.json({ code: "INVALID_FAVORITES_RESPONSE" }, { status: 502 });
    if (favorites.length === 0) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });

    const seedMenuItemIds = [...favorites]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, MAX_SEEDS)
      .map((favorite) => favorite.menuItemId);

    const upstream = await publicApiFetch("/discovery/recommendations/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedMenuItemIds }),
    });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return NextResponse.json({ code: "RECOMMENDATIONS_UNAVAILABLE" }, { status: upstream.status });
    const recommendations = parsePersonalisedRecommendations(body);
    return recommendations
      ? NextResponse.json(recommendations, { headers: { "Cache-Control": "private, no-store" } })
      : NextResponse.json({ code: "INVALID_RECOMMENDATIONS_RESPONSE" }, { status: 502 });
  } catch (error) {
    const auth = error instanceof SessionRequiredError;
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ code: auth ? "AUTHENTICATION_REQUIRED" : timeout ? "RECOMMENDATIONS_TIMEOUT" : "RECOMMENDATIONS_UNAVAILABLE" }, { status: auth ? 401 : timeout ? 504 : 503 });
  }
}
