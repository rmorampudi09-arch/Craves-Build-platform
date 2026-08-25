import { NextRequest, NextResponse } from "next/server";
import { parseOfferList } from "@/lib/offer-engine-contract";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/offers/applicable");
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return NextResponse.json({ code: upstream.status === 401 ? "SESSION_EXPIRED" : "OFFERS_UNAVAILABLE" }, { status: upstream.status });
    const offers = parseOfferList(body);
    return offers ? NextResponse.json(offers, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ code: "INVALID_OFFERS_RESPONSE" }, { status: 502 });
  } catch (error) {
    const auth = error instanceof SessionRequiredError;
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ code: auth ? "AUTHENTICATION_REQUIRED" : timeout ? "OFFERS_TIMEOUT" : "OFFERS_UNAVAILABLE" }, { status: auth ? 401 : timeout ? 504 : 503 });
  }
}
