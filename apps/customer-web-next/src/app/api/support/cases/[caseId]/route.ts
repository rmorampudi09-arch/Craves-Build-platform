import { NextRequest, NextResponse } from "next/server";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";
import { parseSupportCase } from "@/shared/lib/support-cases-contract";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string }> };
const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

export async function GET(request: NextRequest, context: Context) {
  const { caseId } = await context.params;
  if (!isUuid(caseId)) return failure(400, "INVALID_SUPPORT_CASE_ID");
  try {
    const upstream = await authenticatedApiFetch(request, `/support/cases/${caseId}`);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "SUPPORT_CASE_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const supportCase = parseSupportCase(body);
    return supportCase ? NextResponse.json(supportCase, { headers }) : failure(502, "INVALID_SUPPORT_CASE_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "SUPPORT_CASE_UNAVAILABLE");
  }
}
