import { NextRequest, NextResponse } from "next/server";
import { parseChefEvidenceList } from "@/lib/chef-application-evidence-contract";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/chef/application?evidence=true");
    if (!upstream.ok) {
      return NextResponse.json(
        { code: upstream.status === 401 ? "SESSION_EXPIRED" : "EVIDENCE_STATUS_UNAVAILABLE" },
        { status: upstream.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    const items = parseChefEvidenceList(await upstream.json().catch(() => null));
    if (!items) {
      return NextResponse.json(
        { code: "INVALID_EVIDENCE_STATUS_RESPONSE" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(items, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SessionRequiredError) {
      return NextResponse.json(
        { code: "AUTHENTICATION_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { code: "EVIDENCE_STATUS_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
