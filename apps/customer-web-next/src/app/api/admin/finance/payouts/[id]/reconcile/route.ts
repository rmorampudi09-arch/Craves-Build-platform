import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { payoutReconcileRequestSchema, payoutReconcileResponseSchema } from "@/lib/finance-reconciliation-contract";

export const dynamic = "force-dynamic";
type Context = {params: Promise<{id: string}>};
const headers = {"Cache-Control": "no-store"};
export async function POST(request: NextRequest, context: Context) {
  const fail = (status: number, code: string) => NextResponse.json({code}, {status, headers});
  if (!isSameOrigin(request)) return fail(403, "ORIGIN_REJECTED");
  const {id} = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_PAYOUT_INSTRUCTION");
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail(415, "JSON_REQUIRED");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8192) return fail(413, "REQUEST_TOO_LARGE");
  let parsed;
  try {parsed = payoutReconcileRequestSchema.safeParse(JSON.parse(raw));}
  catch {return fail(400, "INVALID_RECONCILIATION_REQUEST");}
  if (!parsed.success) return fail(400, "INVALID_RECONCILIATION_REQUEST");
  try {
    const response = await authenticatedApiFetch(request, `/admin/finance/payouts/${id}/reconcile`, {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(parsed.data),
    }, 25_000);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return fail(response.status, "PAYOUT_RECONCILIATION_REJECTED");
    const result = payoutReconcileResponseSchema.safeParse(body);
    if (!result.success || result.data.instructionId !== id) return fail(502, "PAYOUT_RECONCILIATION_CONTEXT_MISMATCH");
    return NextResponse.json(result.data, {headers});
  } catch (error) {
    return fail(error instanceof SessionRequiredError ? 401 : 503,
      error instanceof SessionRequiredError ? "SESSION_EXPIRED" : "PAYOUT_RECONCILIATION_UNAVAILABLE");
  }
}
