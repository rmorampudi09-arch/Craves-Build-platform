import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { chefStatementSchema, statementPeriodSchema } from "@/lib/finance-source-contract";
import { readDocumentBytes } from "@/lib/document-transport";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = {"Cache-Control": "no-store"};
  const fail = (status: number, code: string) => NextResponse.json({code}, {status, headers});
  const params = request.nextUrl.searchParams;
  if ([...params.keys()].some(key => !["from", "to", "kind"].includes(key) || params.getAll(key).length !== 1)) return fail(400, "INVALID_STATEMENT_QUERY");
  const period = statementPeriodSchema.safeParse({from: params.get("from"), to: params.get("to"), kind: params.get("kind") || "earnings"});
  if (!period.success) return fail(400, "INVALID_STATEMENT_PERIOD");
  const from = new Date(`${period.data.from}T00:00:00+05:30`).toISOString();
  const to = new Date(`${period.data.to}T00:00:00+05:30`).toISOString();
  try {
    const query = new URLSearchParams({from, to, currency: "INR", timezone: "Asia/Kolkata"});
    const response = await authenticatedApiFetch(request, `/document-sources/chef/${period.data.kind}?${query.toString()}`, {}, 20000);
    if (!response.ok) return fail(response.status, response.status === 422 ? "STATEMENT_TOO_LARGE_REDUCE_PERIOD" : "STATEMENT_SOURCE_UNAVAILABLE");
    const result = chefStatementSchema.safeParse(JSON.parse(new TextDecoder().decode(await readDocumentBytes(response.body, 1048576, 5000))));
    const expectedType = period.data.kind === "earnings" ? "CHEF_EARNINGS_STATEMENT" : "CHEF_SETTLEMENT_STATEMENT";
    if (!result.success || result.data.type !== expectedType || result.data.reference !== `${from.replace(".000Z", "Z")} / ${to.replace(".000Z", "Z")}`) return fail(502, "STATEMENT_CONTEXT_MISMATCH");
    return NextResponse.json(result.data, {headers});
  } catch (error) {return fail(error instanceof SessionRequiredError ? 401 : 503, error instanceof SessionRequiredError ? "SESSION_EXPIRED" : "STATEMENT_UNAVAILABLE");}
}
