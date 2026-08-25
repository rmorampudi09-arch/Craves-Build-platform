import { NextRequest, NextResponse } from "next/server";
import { parseCustomerFavorites } from "@/lib/customer-favorites-contract";
import { mapSavedResolverToPersonalisedRecommendations } from "@/lib/personalised-recommendations-contract";
import { publicApiFetch } from "@/lib/public-api";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

const MAX_SEEDS = 20;

export async function GET(request: NextRequest) {
  try {
    const favoritesResponse = await authenticatedApiFetch(request, "/customer/favorites");
    const favoritesBody = await favoritesResponse.json().catch(() => null);
    if (!favoritesResponse.ok) {
      return NextResponse.json(
        { code: favoritesResponse.status === 401 ? "SESSION_EXPIRED" : "RECOMMENDATIONS_UNAVAILABLE" },
        { status: favoritesResponse.status },
      );
    }

    const favorites = parseCustomerFavorites(favoritesBody);
    if (!favorites) {
      return NextResponse.json({ code: "INVALID_FAVORITES_RESPONSE" }, { status: 502 });
    }
    if (favorites.length === 0) {
      return NextResponse.json([], { headers: { "Cache-Control": "private, no-store" } });
    }

    // Preserve the authoritative favorites API order. Do not create an inferred ranking policy here.
    const menuItemIds = favorites.slice(0, MAX_SEEDS).map((favorite) => favorite.menuItemId);
    const upstream = await publicApiFetch("/discovery/saved/menu-items/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuItemIds }),
    });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json({ code: "RECOMMENDATIONS_UNAVAILABLE" }, { status: upstream.status });
    }

    const recommendations = mapSavedResolverToPersonalisedRecommendations(body);
    return recommendations
      ? NextResponse.json(recommendations, { headers: { "Cache-Control": "private, no-store" } })
      : NextResponse.json({ code: "INVALID_RECOMMENDATIONS_RESPONSE" }, { status: 502 });
  } catch (error) {
    const authenticationRequired = error instanceof SessionRequiredError;
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        code: authenticationRequired
          ? "AUTHENTICATION_REQUIRED"
          : timedOut
            ? "RECOMMENDATIONS_TIMEOUT"
            : "RECOMMENDATIONS_UNAVAILABLE",
      },
      { status: authenticationRequired ? 401 : timedOut ? 504 : 503 },
    );
  }
}
