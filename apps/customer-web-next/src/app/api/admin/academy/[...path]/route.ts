import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { academyRoute } from "@/lib/academy-route-policy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
class BodyLimitError extends Error {}
async function readBounded(stream: ReadableStream<Uint8Array> | null, limit: number) {
  if (!stream) return "";
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new BodyLimitError(); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(bytes);
  } finally { reader.releaseLock(); }
}
const failure = (status: number, text: string) => NextResponse.json({ code: `ACADEMY_${status}`, message: text }, { status, headers });
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = academyRoute(request.method, path, request.nextUrl.searchParams);
  if (!target) return failure(404, "Unknown Academy operation.");
  if (request.method !== "GET" && !isSameOrigin(request)) return failure(403, "Invalid request origin. Use the signed-in Craves admin site.");
  try {
    let body: string | undefined;
    if (["POST", "PUT"].includes(request.method)) {
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return failure(415, "JSON content is required.");
      const raw = await readBounded(request.body, 16384);
      try { const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return failure(400, "A JSON object is required."); body = JSON.stringify(parsed); }
      catch { return failure(400, "Invalid JSON request."); }
    }
    const upstream = await authenticatedApiFetch(request, `/academy/${target}`, { method: request.method, headers: body ? { "Content-Type": "application/json" } : {}, body }, 12000);
    if (!upstream.ok) {
      await upstream.body?.cancel();
      const status = [400, 401, 403, 404, 409, 413, 429].includes(upstream.status) ? upstream.status : 503;
      const text = status === 401 ? "Administrator session expired." : status === 403 ? "Your role does not permit this operation." : status === 404 ? "Academy is not enabled or this resource is unavailable. Verify the auth-service feature flag and APIM route." : status === 409 ? "The record or course version changed, or this source requires review. Reload before retrying." : status === 429 ? "Practice limit reached. Wait at least 30 seconds before retrying; a daily cap also applies." : status === 400 ? "Check the submitted fields and answer every question." : "Academy is temporarily unavailable. No success is assumed.";
      const response = failure(status, text); if (status === 429) response.headers.set("Retry-After", "30"); return response;
    }
    const raw = await readBounded(upstream.body, 1048576);
    try { return NextResponse.json(JSON.parse(raw), { headers }); } catch { return failure(502, "Academy returned an invalid response."); }
  } catch (e) {
    return e instanceof SessionRequiredError ? failure(401, "Sign in using your administrator account.") : e instanceof BodyLimitError ? failure(413, "Request or response exceeded the Academy size limit.") : failure(503, "Academy connection unavailable. Retry without changing the request.");
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
