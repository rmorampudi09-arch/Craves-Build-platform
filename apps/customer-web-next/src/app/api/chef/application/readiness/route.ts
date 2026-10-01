import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { parseChefApplicationReadiness } from "@/lib/chef-readiness-contract";

function unavailable(status: number) {
  return NextResponse.json({ message: status === 401 ? "Please sign in again." : "Application readiness is temporarily unavailable. Please try again." },
    { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/chef/application/readiness");
    if (!upstream.ok) return unavailable(upstream.status === 401 ? 401 : 503);
    const readiness = parseChefApplicationReadiness(await upstream.json().catch(() => null));
    return readiness ? NextResponse.json(readiness, { headers: { "Cache-Control": "no-store" } }) : unavailable(502);
  } catch (error) {
    return unavailable(error instanceof SessionRequiredError ? 401 : 503);
  }
}
