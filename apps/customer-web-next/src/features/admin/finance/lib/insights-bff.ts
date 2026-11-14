import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
import { insightsRequest } from "@/features/admin/finance/lib/insights-contract";

const NO_STORE = { "Cache-Control": "no-store, private", Pragma: "no-cache" };
const fail = (status: number, code: string) => NextResponse.json({ code }, { status, headers: NO_STORE });

/** Read-only. integration-service checks the finance role; only fields the contract names reach the browser. */
export async function insightsProxy(request: NextRequest) {
  const target = insightsRequest(request.nextUrl.searchParams);
  if (!target) return fail(400, "INVALID_FINANCE_QUERY");
  try {
    const upstream = await authenticatedApiFetch(request, target.path, {}, 20_000);
    if (!upstream.ok) {
      const status = upstream.status;
      return fail(status >= 400 && status <= 599 ? status : 502, status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FINANCE_ROLE_REQUIRED"
        : status === 404 ? "FINANCE_RECORD_NOT_FOUND" : "FINANCE_READ_REJECTED");
    }
    const body = target.schema.safeParse(await upstream.json().catch(() => null));
    return body.success ? NextResponse.json(body.data, { headers: NO_STORE }) : fail(502, "INVALID_FINANCE_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? fail(401, "SESSION_EXPIRED") : fail(503, "FINANCE_UNAVAILABLE");
  }
}
