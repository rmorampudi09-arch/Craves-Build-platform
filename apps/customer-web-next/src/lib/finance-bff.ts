import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { chefBalanceSchema, draftSchema, financeRoute, financeViewSchema, payoutSchema, subscriptionPreviewSchema } from "@/lib/finance-contract";
import { z } from "zod";

export async function financeProxy(request: NextRequest, scope: "admin" | "chef", segments: string[]) {
  const path = financeRoute(scope, request.method, segments);
  const fail = (status: number, code: string, detail?: string) => NextResponse.json({code, detail}, {status, headers: {"Cache-Control": "no-store"}});
  if (!path) return fail(404, "FINANCE_OPERATION_NOT_FOUND");
  if (request.method !== "GET" && !isSameOrigin(request)) return fail(403, "ORIGIN_REJECTED");
  let payload: string | undefined;
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return fail(415, "JSON_REQUIRED");
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 65536) return fail(413, "FINANCE_REQUEST_TOO_LARGE");
    try { payload = JSON.stringify(JSON.parse(raw)); } catch { return fail(400, "INVALID_JSON"); }
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
      : tail === "subscription-preview" ? subscriptionPreviewSchema : z.object({status: z.string(), notice: z.string().optional()});
    const parsed = schema.safeParse(body);
    return parsed.success ? NextResponse.json(parsed.data, {status: response.status, headers: {"Cache-Control": "no-store"}})
      : fail(502, "INVALID_FINANCE_RESPONSE");
  } catch (error) {
    return fail(error instanceof SessionRequiredError ? 401 : 503, error instanceof SessionRequiredError ? "SESSION_EXPIRED" : "FINANCE_UNAVAILABLE");
  }
}
