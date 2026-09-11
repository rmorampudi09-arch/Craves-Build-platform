import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiBaseUrl } from "@/lib/server-api";
import { isSameOrigin } from "@/lib/request-security";
import { documentCapabilitiesSchema, documentEmailSchema, documentPageSchema, documentRequestSchema, documentSummarySchema, documentTypes, documentTypeSchema } from "@/lib/document-contract";
import { documentQuery, documentRoute, DocumentTransportError, readDocumentBytes } from "@/lib/document-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
let inFlight = 0;
type Context = { params: Promise<{ segments?: string[] }> };
function fail(status: number, code: string) { return NextResponse.json({ code }, { status, headers }); }

async function handle(request: NextRequest, context: Context) {
  const segments = (await context.params).segments ?? [];
  const route = documentRoute(request.method, segments);
  if (!route) return fail(404, "DOCUMENT_ROUTE_NOT_FOUND");
  const token = request.cookies.get("craves_access_token")?.value;
  if (!token) return fail(401, "AUTHENTICATION_REQUIRED");
  if (token.length > 16000) return fail(401, "INVALID_SESSION");
  if (request.method === "POST" && !isSameOrigin(request)) return fail(403, "ORIGIN_REJECTED");
  if (process.env.CRAVES_DOCUMENTS_WEB_ENABLED !== "true") {
    return route === "capabilities" ? NextResponse.json({ enabled: false, emailEnabled: false, types: documentTypes, maxPeriodDays: 31, maxRows: 1000, taxInvoicesEnabled: false }, { headers }) : fail(503, "DOCUMENTS_DISABLED");
  }
  if (inFlight >= 8) return fail(429, "DOCUMENT_PROXY_BUSY");
  inFlight += 1;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 40000);
  try {
    const query = documentQuery(route, request.nextUrl.searchParams);
    const type = request.nextUrl.searchParams.get("type");
    if (type && !documentTypeSchema.safeParse(type).success) return fail(400, "INVALID_DOCUMENT_TYPE");
    const upstreamHeaders: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: route === "download" ? "application/pdf" : "application/json" };
    let body: string | undefined;
    if (request.method === "POST") {
      const key = request.headers.get("Idempotency-Key");
      if (!key || !/^[A-Za-z0-9_-]{16,100}$/.test(key)) return fail(400, "INVALID_IDEMPOTENCY_KEY");
      upstreamHeaders["Idempotency-Key"] = key;
      if (route === "create") {
        if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail(415, "JSON_REQUIRED");
        const bytes = await readDocumentBytes(request.body, 2048, 5000);
        let input: unknown;
        try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail(400, "INVALID_DOCUMENT_REQUEST"); }
        const parsed = documentRequestSchema.safeParse(input);
        if (!parsed.success) return fail(400, "INVALID_DOCUMENT_REQUEST");
        body = JSON.stringify(parsed.data);
        upstreamHeaders["Content-Type"] = "application/json";
      } else {
        const bytes = await readDocumentBytes(request.body, 32, 5000);
        if (bytes.byteLength) return fail(400, "EMAIL_RECIPIENT_BODY_NOT_ALLOWED");
      }
    }
    const path = `/documents${segments.length ? `/${segments.join("/")}` : ""}${query}`;
    const upstream = await fetch(`${apiBaseUrl()}${path}`, { method: request.method, headers: upstreamHeaders, body, signal: controller.signal, redirect: "error", cache: "no-store" });
    const bytes = await readDocumentBytes(upstream.body, route === "download" && upstream.ok ? 4 * 1024 * 1024 : 262144, 30000);
    if (!upstream.ok) {
      let code = upstream.status === 401 ? "SESSION_EXPIRED" : "DOCUMENT_OPERATION_FAILED";
      try {
        const failure = JSON.parse(new TextDecoder().decode(bytes)) as { code?: unknown };
        if (typeof failure.code === "string" && /^[A-Z0-9_]{1,100}$/.test(failure.code)) code = failure.code;
      } catch { /* Only public machine codes may leave the proxy. */ }
      const status = [400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 502, 503, 504].includes(upstream.status) ? upstream.status : 502;
      return fail(status, code);
    }
    if (route === "download") {
      if (!upstream.headers.get("content-type")?.toLowerCase().startsWith("application/pdf") || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return fail(502, "INVALID_DOCUMENT_PDF");
      return new NextResponse(bytes.buffer as ArrayBuffer, { status: 200, headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="craves-${segments[0]}.pdf"`, "Content-Security-Policy": "sandbox", "Content-Length": String(bytes.byteLength) } });
    }
    let raw: unknown;
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail(502, "INVALID_DOCUMENT_RESPONSE"); }
    const schema = route === "capabilities" ? documentCapabilitiesSchema : route === "list" ? documentPageSchema : route === "email" ? documentEmailSchema : route === "emails" ? z.array(documentEmailSchema).max(20) : documentSummarySchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return fail(502, "INVALID_DOCUMENT_RESPONSE");
    if (route === "detail" && documentSummarySchema.parse(parsed.data).id !== segments[0]) return fail(502, "DOCUMENT_CORRELATION_MISMATCH");
    if (route === "email" && documentEmailSchema.parse(parsed.data).documentId !== segments[0]) return fail(502, "DOCUMENT_CORRELATION_MISMATCH");
    if (route === "emails" && z.array(documentEmailSchema).parse(parsed.data).some((entry) => entry.documentId !== segments[0])) return fail(502, "DOCUMENT_CORRELATION_MISMATCH");
    return NextResponse.json(parsed.data, { status: request.method === "POST" && upstream.status === 202 ? 202 : 200, headers });
  } catch (error) {
    if (error instanceof DocumentTransportError) return fail(error.status, error.code);
    return fail(controller.signal.aborted ? 504 : 503, controller.signal.aborted ? "DOCUMENT_OPERATION_TIMEOUT" : "DOCUMENT_OPERATION_UNAVAILABLE");
  } finally { clearTimeout(deadline); controller.abort(); inFlight -= 1; }
}
export async function GET(request: NextRequest, context: Context) { return handle(request, context); }
export async function POST(request: NextRequest, context: Context) { return handle(request, context); }
