import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { isSameOrigin } from "@/shared/lib/request-security";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";
import { parseSupportCase, parseSupportCasePage, SUPPORT_MESSAGE_MAX, SUPPORT_SUBJECT_MAX } from "@/shared/lib/support-cases-contract";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
// Same limits as user-chef-service SupportCaseService.
const createRequest = z.object({
  contextRole: z.enum(["CHEF", "CUSTOMER"]),
  orderId: z.string().refine(isUuid).nullable(),
  subject: z.string().trim().min(1).max(SUPPORT_SUBJECT_MAX),
  message: z.string().trim().min(1).max(SUPPORT_MESSAGE_MAX),
}).strict();

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

// Ticket contents are private: never log the request or upstream body here.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = params.get("limit") ?? "20", cursor = params.get("cursor");
  if (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50 || (cursor !== null && (!cursor || cursor.length > 512))) {
    return failure(400, "INVALID_SUPPORT_CASE_QUERY");
  }
  const query = new URLSearchParams({ limit });
  if (cursor) query.set("cursor", cursor);
  try {
    const upstream = await authenticatedApiFetch(request, `/support/cases?${query}`);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "SUPPORT_CASE_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const page = parseSupportCasePage(body);
    return page ? NextResponse.json(page, { headers }) : failure(502, "INVALID_SUPPORT_CASE_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "SUPPORT_CASE_UNAVAILABLE");
  }
}

export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const input = createRequest.safeParse(await bounded.json().catch(() => null));
  if (!input.success) return failure(400, "INVALID_SUPPORT_CASE_REQUEST");
  try {
    const upstream = await authenticatedApiFetch(bounded, "/support/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.data),
    });
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "SUPPORT_CASE_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const created = parseSupportCase(body);
    return created ? NextResponse.json(created, { status: 201, headers }) : failure(502, "INVALID_SUPPORT_CASE_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "SUPPORT_CASE_UNAVAILABLE");
  }
}
