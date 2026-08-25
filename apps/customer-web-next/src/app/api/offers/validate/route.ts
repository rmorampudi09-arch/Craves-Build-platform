import { NextRequest, NextResponse } from "next/server";
import { parseOfferResponse } from "@/lib/offer-engine-contract";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export async function POST(request: NextRequest) {
  const input = await request.json().catch(() => null);
  const code = input && typeof input === "object" && "code" in input && typeof input.code === "string" ? input.code.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(code)) return NextResponse.json({ code: "INVALID_OFFER_CODE" }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, "/offers/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return NextResponse.json({ code: upstream.status === 409 ? "OFFER_NOT_APPLICABLE" : upstream.status === 401 ? "SESSION_EXPIRED" : "OFFER_VALIDATION_FAILED" }, { status: upstream.status });
    const offer = parseOfferResponse(body);
    return offer ? NextResponse.json(offer, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ code: "INVALID_OFFER_RESPONSE" }, { status: 502 });
  } catch (error) {
    const auth = error instanceof SessionRequiredError;
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ code: auth ? "AUTHENTICATION_REQUIRED" : timeout ? "OFFERS_TIMEOUT" : "OFFERS_UNAVAILABLE" }, { status: auth ? 401 : timeout ? 504 : 503 });
  }
}
