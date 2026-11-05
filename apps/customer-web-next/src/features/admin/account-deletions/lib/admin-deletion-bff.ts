import { NextRequest, NextResponse } from "next/server";
import { parseAdminSummary, parseOpenItems } from "@/features/account-deletion/domain/deletion-contract";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
export const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
export const failure = (status: number, code: string) => reply({ code }, status);
/** A parsed backend body goes out as it is; one the parser refuses is a 502, never passed on raw. */
export const replyParsed = (value: unknown) => (value ? reply(value) : failure(502, "INVALID_DELETION_RESPONSE"));

export const OPEN_ITEMS = "ACCOUNT_DELETION_HAS_OPEN_ITEMS";
// The only backend codes the browser sees, each answered with the status below. Any other code or message stays on the server.
const KNOWN_CODES = new Map([
  ["ADMIN_ACCESS_REQUIRED", 403], ["ADMIN_ROLE_REQUIRED", 403], ["ACCOUNT_DELETION_OWN_REQUEST", 403],
  ["ACCOUNT_DELETION_NOT_REVIEWABLE", 409], [OPEN_ITEMS, 409], ["NO_DELETION_REQUEST", 404],
  ["ACCOUNT_DELETION_NOT_ENABLED", 503], ["ADMIN_REASON_INVALID", 400],
]);

function upstreamFailure(status: number, body: unknown): NextResponse {
  if (status === 401) return failure(401, "ADMIN_SESSION_EXPIRED");
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
  // Before the gateway publishes the routes it answers 404 or 405 with no Craves code: not switched on yet, not an outage.
  if ((status === 404 || status === 405) && !code) return failure(503, "ACCOUNT_DELETION_NOT_ENABLED");
  const known = typeof code === "string" ? KNOWN_CODES.get(code) : undefined;
  if (!known || typeof code !== "string") return failure(503, "ACCOUNT_DELETION_UNAVAILABLE");
  if (code !== OPEN_ITEMS) return failure(known, code);
  const blockers = parseOpenItems(body);
  return blockers ? reply({ code, blockers }, known) : failure(502, "INVALID_DELETION_RESPONSE");
}

/** One backend call. Failures become a code from the list above; a success body goes to `finish`, which must parse it. */
export async function forward(
  request: NextRequest, path: string, init: RequestInit, timeoutMs: number,
  finish: (body: unknown) => NextResponse | Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const upstream = await authenticatedApiFetch(request, path, init, timeoutMs);
    const body: unknown = await upstream.json().catch(() => null);
    return upstream.ok ? await finish(body) : upstreamFailure(upstream.status, body);
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "ADMIN_SESSION_EXPIRED") : failure(503, "ACCOUNT_DELETION_UNAVAILABLE");
  }
}

export type RequestContext = { params: Promise<{ requestId: string }> };

/** The request id from the URL, or the 404 to send when it is not a UUID (the backend is never called with it). */
export async function requestIdOf(context: RequestContext): Promise<string | NextResponse> {
  const { requestId } = await context.params;
  return isUuid(requestId) ? requestId : failure(404, "NO_DELETION_REQUEST");
}

/** The default of `authenticatedApiFetch`, stated so each route's wait is visible and tested. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Approve or reject: same-origin JSON {reason} of 10 to 500 characters once trimmed, forwarded as {reason}. */
export async function decide(request: NextRequest, context: RequestContext, action: "approve" | "reject", timeoutMs: number): Promise<NextResponse> {
  const requestId = await requestIdOf(context);
  if (requestId instanceof NextResponse) return requestId;
  // 4 KiB covers 500 characters even when every one is escaped.
  const bounded = await boundBffRequest(request, { maxBytes: 4096 });
  if (bounded instanceof NextResponse) {
    for (const [name, value] of Object.entries(headers)) bounded.headers.set(name, value);
    return bounded;
  }
  const input: unknown = await bounded.json().catch(() => null);
  const raw = input && typeof input === "object" ? (input as { reason?: unknown }).reason : undefined;
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < 10 || reason.length > 500) return failure(400, "ADMIN_REASON_INVALID");
  return forward(bounded, `/admin/account-deletions/${requestId}/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
  }, timeoutMs, body => replyParsed(parseAdminSummary(body)));
}
