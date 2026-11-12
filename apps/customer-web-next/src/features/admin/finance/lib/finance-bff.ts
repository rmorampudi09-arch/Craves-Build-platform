import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
import { chefBalanceSchema, draftSchema, financeRoute, financeViewSchema, payoutSchema, subscriptionPreviewSchema, deliveryPreviewSchema } from "@/features/admin/finance/lib/finance-contract";
import { z } from "zod";

export async function financeProxy(request: NextRequest, scope: "admin" | "chef", segments: string[]) {
  const path = financeRoute(scope, request.method, segments);
  const fail = (status: number, code: string, detail?: string) => NextResponse.json({code, detail}, {status, headers: {"Cache-Control": "no-store"}});
  if (!path) return fail(404, "FINANCE_OPERATION_NOT_FOUND");
  if (request.method !== "GET" && !isSameOrigin(request)) return fail(403, "ORIGIN_REJECTED");
  let payload: string | undefined;
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return fail(415, "JSON_REQUIRED");
    // This runs before the session is checked, so the body is read like every other BFF write: bounded while
    // streaming, timed, and counted against the reader slots, never a plain text() anyone can keep open.
    const bounded = await boundBffRequest(request, { maxBytes: 65536 });
    if (bounded instanceof NextResponse) return bounded;
    try { payload = JSON.stringify(JSON.parse(await bounded.text())); } catch { return fail(400, "INVALID_JSON"); }
  }
  try {
    const response = await authenticatedApiFetch(request, path, {method: request.method,
      ...(payload === undefined ? {} : {headers: {"Content-Type": "application/json"}, body: payload})}, 20_000);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = z.object({code: z.string().max(100).optional(), detail: z.string().max(500).optional()}).safeParse(body);
      return fail(response.status >= 400 && response.status <= 599 ? response.status : 502,
        error.success && error.data.code ? error.data.code : "FINANCE_REQUEST_REJECTED", error.success ? error.data.detail : undefined);
    }
    const tail = segments.at(-1);
    const schema = tail === "settings" || tail === "activate" ? financeViewSchema : tail === "policies" ? draftSchema
      : tail === "balance" ? chefBalanceSchema : tail === "withdrawals" ? payoutSchema : tail === "payouts" ? z.array(payoutSchema)
      : tail === "subscription-preview" ? subscriptionPreviewSchema : tail === "delivery-preview" ? deliveryPreviewSchema : z.object({status: z.string(), notice: z.string().optional()});
    const parsed = schema.safeParse(body);
    return parsed.success ? NextResponse.json(parsed.data, {status: response.status, headers: {"Cache-Control": "no-store"}})
      : fail(502, "INVALID_FINANCE_RESPONSE");
  } catch (error) {
    return fail(error instanceof SessionRequiredError ? 401 : 503, error instanceof SessionRequiredError ? "SESSION_EXPIRED" : "FINANCE_UNAVAILABLE");
  }
}
