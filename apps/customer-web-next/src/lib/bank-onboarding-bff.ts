import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { bankControlChangeSchema, bankControlsSchema, bankStatusSchema, bankSubmissionSchema } from "@/lib/bank-onboarding-contract";

async function boundedJson(request: NextRequest): Promise<unknown> {
  if (!request.body) throw new Error("MISSING_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {timedOut = true; void reader.cancel().catch(() => undefined);}, 5000);
  try {
    while (true) {
      const result = await reader.read();
      if (timedOut) throw new Error("BODY_TIMEOUT");
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 8192) {await reader.cancel(); throw new Error("BODY_TOO_LARGE");}
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
  } finally {clearTimeout(timer); reader.releaseLock();}
}

export async function bankOnboardingProxy(request: NextRequest, scope: "chef" | "admin") {
  const headers = {"Cache-Control": "no-store", "Pragma": "no-cache"};
  const fail = (status: number, code: string) => NextResponse.json({code}, {status, headers});
  if (!["GET", "POST"].includes(request.method)) return fail(405, "METHOD_NOT_ALLOWED");
  if (request.method === "POST" && !isSameOrigin(request)) return fail(403, "ORIGIN_REJECTED");
  let body: string | undefined;
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail(415, "JSON_REQUIRED");
    try {
      const value = await boundedJson(request);
      const parsed = (scope === "chef" ? bankSubmissionSchema : bankControlChangeSchema).safeParse(value);
      if (!parsed.success) return fail(400, "INVALID_BANK_REQUEST");
      body = JSON.stringify(parsed.data);
    } catch (error) {
      return fail(error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, "INVALID_BANK_REQUEST");
    }
  }
  try {
    const path = scope === "chef" ? "/chef-onboarding/bank" : "/admin/finance/bank-onboarding";
    const response = await authenticatedApiFetch(request, path, {method: request.method,
      ...(body === undefined ? {} : {headers: {"Content-Type": "application/json"}, body})}, 20_000);
    if (!response.ok) return fail(response.status, response.status === 409 ? "BANK_PROFILE_CHANGED_OR_PAYOUT_PENDING"
      : response.status === 429 ? "BANK_REQUEST_LIMIT_REACHED" : "BANK_ONBOARDING_UNAVAILABLE");
    const value: unknown = await response.json().catch(() => null);
    const parsed = (scope === "chef" ? bankStatusSchema : bankControlsSchema).safeParse(value);
    if (!parsed.success) return fail(502, "INVALID_BANK_RESPONSE");
    // Only the strict allowlisted read contract leaves the server. Bank numbers and encrypted data never do.
    return NextResponse.json(parsed.data, {headers});
  } catch (error) {
    return fail(error instanceof SessionRequiredError ? 401 : 503,
      error instanceof SessionRequiredError ? "SESSION_EXPIRED" : "BANK_ONBOARDING_UNAVAILABLE");
  }
}
