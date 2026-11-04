import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import {
  ADMIN_REASON, deadLetterError, deadLetterRetryError, deadLetterSchema, pageSchema, querySchema, retryQuerySchema,
} from "./dead-letter-contract";

const NO_STORE = { "Cache-Control": "no-store, private", Pragma: "no-cache" };

function fail(status: number, code: string, message: string, correlationId?: string) {
  return NextResponse.json({ code, message }, { status, headers: { ...NO_STORE, ...(correlationId ? { "X-Correlation-ID": correlationId } : {}) } });
}

/**
 * Read-only: forwards one listing with its audit reason; integration-service checks the role per source and writes the
 * audit row, which keeps the correlation id sent here, so the admin can quote it.
 */
export async function deadLetterProxy(request: NextRequest) {
  const names = [...request.nextUrl.searchParams.keys()];
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success || new Set(names).size !== names.length) {
    return fail(400, "INVALID_QUERY", query.success ? "Each filter can be given once." : query.error.issues[0]?.message ?? "The filters are not valid.");
  }
  const reason = (request.headers.get("x-admin-reason") ?? "").trim();
  if (!ADMIN_REASON.test(reason)) return fail(400, "ADMIN_REASON_REQUIRED", "Write why you are looking (10 to 500 plain characters).");

  const correlationId = randomUUID();
  const search = new URLSearchParams(Object.entries(query.data).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  try {
    const upstream = await authenticatedApiFetch(request, `/admin/operations/dead-letters?${search}`,
      { headers: { "X-Admin-Reason": reason, "X-Correlation-ID": correlationId } }, 15_000, 1024 * 1024);
    if (!upstream.ok) {
      const error = deadLetterError(upstream.status);
      return fail(upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502, error.code, error.message, correlationId);
    }
    const page = pageSchema.safeParse(await upstream.json().catch(() => null));
    if (!page.success || page.data.source !== query.data.source) {
      return fail(502, "INVALID_RESPONSE", "The integration service sent an unexpected answer. Refresh and try again.", correlationId);
    }
    return NextResponse.json(page.data, { headers: { ...NO_STORE, "X-Correlation-ID": correlationId } });
  } catch (error) {
    return error instanceof SessionRequiredError
      ? fail(401, "AUTHENTICATION_REQUIRED", "Your session has ended. Sign in again.")
      : fail(503, "DEAD_LETTERS_UNAVAILABLE", "The integration service is unavailable. Try again shortly.", correlationId);
  }
}

/**
 * One more attempt for one dead-lettered delivery webhook. Same origin only; integration-service checks the role
 * (platform or operations admin), refuses Cashfree webhooks and delivery commands, and audits the retry.
 */
export async function deadLetterRetryProxy(request: NextRequest) {
  const bounded = await boundBffRequest(request); // also refuses another origin
  if (bounded instanceof NextResponse) return bounded;
  const names = [...request.nextUrl.searchParams.keys()];
  const query = retryQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success || new Set(names).size !== names.length) {
    return fail(400, "INVALID_QUERY", "Only a delivery webhook record can be retried here.");
  }
  const reason = (request.headers.get("x-admin-reason") ?? "").trim();
  if (!ADMIN_REASON.test(reason)) return fail(400, "ADMIN_REASON_REQUIRED", "Write why you are retrying (10 to 500 plain characters).");

  const correlationId = randomUUID();
  try {
    const upstream = await authenticatedApiFetch(request, `/admin/operations/dead-letters/${query.data.id}/retry?source=DELIVERY_WEBHOOK`,
      { method: "POST", headers: { "X-Admin-Reason": reason, "X-Correlation-ID": correlationId } }, 15_000, 64 * 1024);
    if (!upstream.ok) {
      const error = deadLetterRetryError(upstream.status);
      return fail(upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502, error.code, error.message, correlationId);
    }
    const row = deadLetterSchema.safeParse(await upstream.json().catch(() => null));
    if (!row.success || row.data.id !== query.data.id || row.data.source !== "DELIVERY_WEBHOOK") {
      return fail(502, "INVALID_RESPONSE", "The integration service sent an unexpected answer. Refresh the list.", correlationId);
    }
    return NextResponse.json(row.data, { headers: { ...NO_STORE, "X-Correlation-ID": correlationId } });
  } catch (error) {
    return error instanceof SessionRequiredError
      ? fail(401, "AUTHENTICATION_REQUIRED", "Your session has ended. Sign in again.")
      : fail(503, "DEAD_LETTERS_UNAVAILABLE", "The integration service is unavailable. Try again shortly.", correlationId);
  }
}
