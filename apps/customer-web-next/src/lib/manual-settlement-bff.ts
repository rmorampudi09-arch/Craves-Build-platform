import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { readDocumentBytes } from "@/lib/document-transport";
import { isSameOrigin } from "@/lib/request-security";
import { manualActionSchema, manualBalanceSchema, manualInstructionSchema, manualReservationSchema, manualSettlementRoute } from "@/lib/manual-settlement-contract";

export async function manualSettlementProxy(request: NextRequest, segments: string[]) {
  const headers = {"Cache-Control": "no-store", "Pragma": "no-cache"};
  const fail = (status: number, code: string) => NextResponse.json({code}, {status, headers});
  const path = manualSettlementRoute(request.method, segments);
  if (!path) return fail(404, "MANUAL_SETTLEMENT_OPERATION_NOT_FOUND");
  let payload: string | undefined;
  if (request.method === "POST") {
    if (!isSameOrigin(request)) return fail(403, "ORIGIN_REJECTED");
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail(415, "JSON_REQUIRED");
    try {
      const raw: unknown = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(await readDocumentBytes(request.body, 16384, 5000)));
      const result = (segments.at(-1) === "actions" ? manualActionSchema : manualReservationSchema).safeParse(raw);
      if (!result.success) return fail(400, "INVALID_MANUAL_SETTLEMENT_REQUEST");payload = JSON.stringify(result.data);
    } catch {return fail(400, "INVALID_OR_OVERSIZED_MANUAL_SETTLEMENT_REQUEST");}
  }
  try {
    const response = await authenticatedApiFetch(request, path, {method: request.method,
      ...(payload === undefined ? {} : {headers: {"Content-Type": "application/json"}, body: payload})}, 20000);
    if (!response.ok) return fail(response.status, response.status === 401 ? "SESSION_EXPIRED" : "MANUAL_SETTLEMENT_REJECTED");
    const raw: unknown = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(await readDocumentBytes(response.body, 131072, 5000)));
    if (request.method === "GET" && segments.length === 1) {
      const result = z.array(manualInstructionSchema).max(100).safeParse(raw);
      return result.success ? NextResponse.json(result.data, {headers}) : fail(502, "INVALID_MANUAL_SETTLEMENT_RESPONSE");
    }
    if (request.method === "GET") {
      const result = manualBalanceSchema.safeParse(raw);
      if (!result.success || result.data.chefIdentityId.toLowerCase() !== segments[1].toLowerCase()
        || result.data.recent.some(row => row.chefIdentityId.toLowerCase() !== segments[1].toLowerCase())) return fail(502, "MANUAL_SETTLEMENT_OWNER_MISMATCH");
      return NextResponse.json(result.data, {headers});
    }
    const result = manualInstructionSchema.safeParse(raw);
    if (!result.success || (segments[0] === "chefs" ? result.data.chefIdentityId.toLowerCase() : result.data.id.toLowerCase()) !== segments[1].toLowerCase()) return fail(502, "MANUAL_SETTLEMENT_IDENTITY_MISMATCH");
    return NextResponse.json(result.data, {headers});
  } catch (error) {return fail(error instanceof SessionRequiredError ? 401 : 503, error instanceof SessionRequiredError ? "SESSION_EXPIRED" : "MANUAL_SETTLEMENT_UNAVAILABLE");}
}
