import { chefUpstream } from "@/features/chef/lib/chef-errors";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
import { parseChefApplicationReadiness } from "@/features/chef/lib/chef-readiness-contract";

function unavailable(status: number, raw: unknown = null) {
  return NextResponse.json({ message: status === 401 ? "Please sign in again." : "Application readiness is temporarily unavailable. Please try again.", ...chefUpstream(raw) },
    { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/chef/application/readiness");
    if (!upstream.ok) return unavailable(upstream.status === 401 ? 401 : 503, await upstream.json().catch(() => null));
    const readiness = parseChefApplicationReadiness(await upstream.json().catch(() => null));
    return readiness ? NextResponse.json(readiness, { headers: { "Cache-Control": "no-store" } }) : unavailable(502);
  } catch (error) {
    return unavailable(error instanceof SessionRequiredError ? 401 : 503);
  }
}
