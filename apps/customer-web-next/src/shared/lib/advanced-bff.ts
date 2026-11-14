import { NextRequest, NextResponse } from "next/server";
import { findAdvancedOperation } from "./advanced-operations";
import { boundBffRequest } from "./bff-request-limits";
import { upstreamFailure } from "./feature-availability";
import { publicApiFetch } from "./public-api";
import { isSameOrigin, socketPeerKey } from "./request-security";
import { authenticatedApiFetch, SessionRequiredError } from "./server-api";

const NO_STORE = { "Cache-Control": "private, no-store" };
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

function fail(status: number, code: string): NextResponse {
  return NextResponse.json({ code }, { status, headers: NO_STORE });
}

// The gateway sees every public read coming from this site's own address, so one visitor must not use up everyone's
// budget: each replica allows a visitor (Front Door's socket IP) 30 public reads a minute, and remembers at most
// 10,000 visitors a minute.
const PUBLIC_READS_PER_MINUTE = 30;
let publicReads = { start: 0, counts: new Map<string, number>() };

function allowPublicRead(peer: string | null, now = Date.now()): boolean {
  if (now - publicReads.start >= 60_000) publicReads = { start: now, counts: new Map() };
  const key = peer ?? "unknown";
  const used = publicReads.counts.get(key) ?? 0;
  if (used >= PUBLIC_READS_PER_MINUTE || (used === 0 && publicReads.counts.size >= 10_000)) return false;
  publicReads.counts.set(key, used + 1);
  return true;
}

/**
 * Forwards one allowlisted call (advanced-operations.ts) to https://api.craves.in/api/v1/advanced/…, signed with the
 * person's cookie token unless the call is public. Only Idempotency-Key is forwarded; the answer's JSON passes
 * through (the browser parses it strictly), 204 stays 204, and failures carry the service's own code.
 */
export async function advancedProxy(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const operation = findAdvancedOperation(request.method, segments);
  if (!operation) return fail(404, "ADVANCED_OPERATION_NOT_FOUND");
  if (request.method !== "GET" && !isSameOrigin(request)) return fail(403, "ORIGIN_REJECTED");
  if (operation.auth === "public" && !allowPublicRead(socketPeerKey(request))) {
    return NextResponse.json({ code: "TOO_MANY_REQUESTS" }, { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } });
  }

  let body: string | undefined;
  if (operation.body === "none") {
    // A real server hands a bodyless DELETE or POST an empty stream, so judge it after reading it (bounded).
    if (request.method !== "GET") {
      const bounded = await boundBffRequest(request, { maxBytes: 8192 });
      if (bounded instanceof NextResponse) return bounded;
      if ((await bounded.text()).length > 0) return fail(400, "INVALID_REQUEST");
    }
  } else {
    const bounded = await boundBffRequest(request, { maxBytes: 8192 });
    if (bounded instanceof NextResponse) return bounded;
    const raw = await bounded.text();
    if (raw.trim()) {
      if (!request.headers.get("content-type")?.startsWith("application/json")) return fail(415, "JSON_REQUIRED");
      try {
        body = JSON.stringify(JSON.parse(raw));
      } catch {
        return fail(400, "INVALID_REQUEST");
      }
    } else if (operation.body === "required") {
      return fail(400, "INVALID_REQUEST");
    }
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const key = request.headers.get("idempotency-key");
  if (key && IDEMPOTENCY_KEY.test(key)) headers["Idempotency-Key"] = key;
  const path = `/advanced/${segments.join("/")}`;
  const init: RequestInit = { method: request.method, headers, ...(body === undefined ? {} : { body }) };

  try {
    const upstream = operation.auth === "public" ? await publicApiFetch(path, init) : await authenticatedApiFetch(request, path, init);
    if (upstream.status === 204) return new NextResponse(null, { status: 204, headers: NO_STORE });
    const payload: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const failure = upstreamFailure(upstream.status, payload, "ADVANCED_REQUEST_FAILED");
      return fail(failure.status, failure.code);
    }
    return payload === null ? fail(502, "INVALID_ADVANCED_RESPONSE") : NextResponse.json(payload, { status: upstream.status, headers: NO_STORE });
  } catch (error) {
    return error instanceof SessionRequiredError ? fail(401, "SESSION_EXPIRED") : fail(503, "ADVANCED_UNAVAILABLE");
  }
}
