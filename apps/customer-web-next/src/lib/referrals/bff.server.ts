// Import only from a future, reviewed Node-runtime route handler. This file mounts no route.
export type ReferralSession = { accessToken: string; roles: readonly string[] };
export type ReferralBffOptions = {
  enabled: boolean;
  backendOrigin: string;
  publicOrigin: string;
  resolveSession: (request: Request, scope: "member" | "admin") => Promise<ReferralSession | null>;
  fetchImpl?: typeof fetch;
};
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", Vary: "Cookie, Authorization" };
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const READ = new RegExp(`^/(?:me(?:/code(?:/qr)?|/rewards|/cashouts)?|admin/(?:overview|policies|queues/(?:fraud|cashouts|outbox)|inbox|audit(?:/export)?))$`);
const WRITE = new RegExp(`^/(?:me/cashouts(?:/${UUID}/cancel)?|admin/(?:policies(?:/[1-9][0-9]{0,18}/approve)?|fraud/${UUID}/resolve|rewards/${UUID}/reverse|cashouts/${UUID}/approve|inbox/(?:auth|order|finance)/${UUID}/replay|outbox/${UUID}/replay))$`);
function error(status: number, code: string) { return Response.json({ code }, { status, headers: privateHeaders }); }
function origin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("An explicit HTTPS origin is required");
  return url.origin;
}
async function readBounded(body: ReadableStream<Uint8Array> | null, maximum: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      total += next.value.byteLength;
      if (total > maximum) { await reader.cancel(); throw new Error("BODY_LIMIT"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const value = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { value.set(chunk, offset); offset += chunk.byteLength; }
  return value;
}
export function createReferralBff(options: ReferralBffOptions) {
  if (typeof window !== "undefined") throw new Error("Referral BFF is server-only");
  const publicOrigin = origin(options.publicOrigin), backendOrigin = origin(options.backendOrigin);
  const upstream = options.fetchImpl ?? fetch;
  return async function handle(request: Request): Promise<Response> {
    if (!options.enabled) return error(503, "REFERRAL_PUBLIC_ACCESS_DISABLED");
    const url = new URL(request.url), prefix = "/api/referrals";
    if (url.origin !== publicOrigin || !url.pathname.startsWith(prefix + "/")) return error(404, "ROUTE_NOT_FOUND");
    const path = url.pathname.slice(prefix.length), write = request.method === "POST";
    if ((request.method !== "GET" && !write) || !(write ? WRITE : READ).test(path)) return error(405, "METHOD_NOT_ALLOWED");
    if (request.headers.get("sec-fetch-site") === "cross-site") return error(403, "ORIGIN_REJECTED");
    if (write && (request.headers.get("origin") !== publicOrigin || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? ""))) return error(403, "ORIGIN_OR_CONTENT_TYPE_REJECTED");
    const allowedQuery = path.includes("/queues/") ? ["limit", "cursor", "state"] : path === "/admin/inbox" ? ["limit", "source", "afterId"] : path.startsWith("/admin/audit") ? ["limit", "afterId"] : ["limit", "cursor"];
    if (url.search.length > 2048 || (write && url.search) || [...url.searchParams.keys()].some(key => !allowedQuery.includes(key) || url.searchParams.getAll(key).length !== 1)) return error(422, "INVALID_QUERY");
    let body: string | undefined;
    if (write) {
      try {
        const bytes = await readBounded(request.body, 32768);
        body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        const parsed: unknown = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return error(422, "JSON_OBJECT_REQUIRED");
      } catch { return error(413, "INVALID_OR_OVERSIZED_BODY"); }
    }
    const scope = path.startsWith("/admin/") ? "admin" : "member";
    let session: ReferralSession | null;
    try { session = await options.resolveSession(request, scope); } catch { return error(503, "SESSION_VERIFICATION_UNAVAILABLE"); }
    if (!session) return error(401, "AUTHENTICATION_REQUIRED");
    if (!session.accessToken || /[\r\n]/.test(session.accessToken) || session.accessToken.length > 16384) return error(401, "AUTHENTICATION_REQUIRED");
    if (scope === "admin" && !session.roles.some(role => role.toUpperCase() === "ADMIN")) return error(403, "ACCESS_DENIED");
    try {
      const response = await upstream(`${backendOrigin}/api/v1/referrals${path}${url.search}`, {
        method: request.method, body, redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${session.accessToken}`, Accept: path.endsWith("/qr") ? "image/svg+xml" : path.endsWith("/export") ? "application/x-ndjson" : "application/json", ...(write ? { "Content-Type": "application/json" } : {}) },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)])
      });
      if (!response.ok) {
        const bytes = await readBounded(response.body, 16384);
        let code = "REQUEST_FAILED";
        try { const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { code?: unknown }; if (typeof parsed.code === "string" && /^[A-Z0-9_]{1,100}$/.test(parsed.code)) code = parsed.code; } catch { /* Never relay upstream HTML, stack traces or credentials. */ }
        return error(response.status >= 400 && response.status <= 599 ? response.status : 502, code);
      }
      if (response.status === 204) return new Response(null, { status: 204, headers: privateHeaders });
      const expected = path.endsWith("/qr") ? "image/svg+xml" : path.endsWith("/export") ? "application/x-ndjson" : "application/json";
      if (!response.headers.get("content-type")?.toLowerCase().startsWith(expected)) return error(502, "INVALID_RESPONSE");
      const bytes = await readBounded(response.body, 2097152);
      const headers = new Headers({ ...privateHeaders, "Content-Type": expected });
      if (expected === "image/svg+xml") headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
      if (expected === "application/x-ndjson") {
        headers.set("Content-Disposition", "attachment; filename=craves-referral-audit.ndjson");
        const next = response.headers.get("X-Next-Audit-Id"), more = response.headers.get("X-Has-More");
        if (next && /^\d{1,19}$/.test(next)) headers.set("X-Next-Audit-Id", next);
        if (more === "true" || more === "false") headers.set("X-Has-More", more);
      }
      return new Response(bytes as BodyInit, { status: response.status, headers });
    } catch { return error(502, write ? "REQUEST_UNCERTAIN" : "REQUEST_FAILED"); }
  };
}
