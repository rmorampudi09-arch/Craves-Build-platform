import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { isSameOrigin } from "@/lib/request-security";
import { readDocumentBytes } from "@/lib/document-transport";
import { canonicalFinanceId, taxProfileRequestSchema, taxProfileVersionSchema } from "@/lib/finance-source-contract";
export const dynamic = "force-dynamic";
type Context = {params: Promise<{chef: string}>};
const headers = {"Cache-Control": "no-store"};
async function proxy(request: NextRequest, context: Context) {
  const fail = (status: number, code: string) => NextResponse.json({code}, {status, headers});
  const {chef} = await context.params;
  if (!canonicalFinanceId.safeParse(chef).success) return fail(400, "INVALID_CHEF_ID");
  let payload: string | undefined;
  if (request.method === "POST") {
    if (!isSameOrigin(request)) return fail(403, "ORIGIN_REJECTED");
    if (!request.headers.get("content-type")?.startsWith("application/json")) return fail(415, "JSON_REQUIRED");
    try {
      const input = taxProfileRequestSchema.safeParse(JSON.parse(new TextDecoder().decode(await readDocumentBytes(request.body, 16384, 5000))));
      if (!input.success) return fail(400, "INVALID_TAX_PROFILE");payload = JSON.stringify(input.data);
    } catch {return fail(400, "INVALID_OR_OVERSIZED_TAX_PROFILE");}
  }
  try {
    const response = await authenticatedApiFetch(request, `/admin/finance/chefs/${chef}/tax-profile`, {method: request.method,
      ...(payload === undefined ? {} : {headers: {"Content-Type": "application/json"}, body: payload})});
    if (!response.ok) return fail(response.status, "CHEF_TAX_PROFILE_NOT_CONFIRMED");
    const result = taxProfileVersionSchema.safeParse(await response.json());
    if (!result.success || result.data.chefIdentityId.toLowerCase() !== chef.toLowerCase()) return fail(502, "TAX_PROFILE_IDENTITY_MISMATCH");
    return NextResponse.json(result.data, {headers});
  } catch (error) {return fail(error instanceof SessionRequiredError ? 401 : 503, error instanceof SessionRequiredError ? "SESSION_EXPIRED" : "TAX_PROFILE_UNAVAILABLE");}
}
export async function GET(request: NextRequest, context: Context) {return proxy(request, context);}
export async function POST(request: NextRequest, context: Context) {return proxy(request, context);}
