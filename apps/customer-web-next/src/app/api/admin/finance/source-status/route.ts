import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { sourceStatusSchema } from "@/lib/finance-source-contract";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = {"Cache-Control": "no-store"};
  try {
    const response = await authenticatedApiFetch(request, "/admin/finance/source-status");
    if (!response.ok) return NextResponse.json({code: "FINANCE_SOURCE_STATUS_UNAVAILABLE"}, {status: response.status, headers});
    const result = sourceStatusSchema.safeParse(await response.json());
    return result.success ? NextResponse.json(result.data, {headers}) : NextResponse.json({code: "INVALID_FINANCE_SOURCE_STATUS"}, {status: 502, headers});
  } catch (error) {return NextResponse.json({code: error instanceof SessionRequiredError ? "SESSION_EXPIRED" : "FINANCE_SOURCE_UNAVAILABLE"}, {status: error instanceof SessionRequiredError ? 401 : 503, headers});}
}
