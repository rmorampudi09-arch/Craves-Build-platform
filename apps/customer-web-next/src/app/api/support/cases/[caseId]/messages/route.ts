import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";
import { parseSupportCase, SUPPORT_MESSAGE_MAX } from "@/shared/lib/support-cases-contract";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ caseId: string }> };
const headers = { "Cache-Control": "no-store" };
const replyRequest = z.object({ message: z.string().trim().min(1).max(SUPPORT_MESSAGE_MAX) }).strict();

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

// Ticket contents are private: never log the request or upstream body here.
export async function POST(request: NextRequest, context: Context) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const { caseId } = await context.params;
  if (!isUuid(caseId)) return failure(400, "INVALID_SUPPORT_CASE_ID");
  const input = replyRequest.safeParse(await bounded.json().catch(() => null));
  if (!input.success) return failure(400, "INVALID_SUPPORT_CASE_REQUEST");
  try {
    const upstream = await authenticatedApiFetch(bounded, `/support/cases/${caseId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.data),
    });
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
