import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
import { bannerTarget, bannerUpdateSchema } from "@/features/admin/banners/lib/home-banner-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
const failure = (status: number, message: string) => NextResponse.json({ message }, { status, headers });
class LimitError extends Error {}
async function boundedBody(stream: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > max) { await reader.cancel(); throw new LimitError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function handle(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const target = bannerTarget(request.method, path);
  if (!target) return failure(404, "Unknown banner operation.");
  if (request.method !== "GET" && !isSameOrigin(request)) return failure(403, "Invalid request origin.");
  try {
    let body: BodyInit | undefined;
    let outgoing: HeadersInit = {};
    if (request.method === "POST") {
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.startsWith("multipart/form-data;")) return failure(415, "Choose a JPEG or PNG image.");
      const bytes = await boundedBody(request.body, 2 * 1024 * 1024 + 16 * 1024);
      const form = await new Response(bytes as BodyInit, { headers: { "Content-Type": contentType } }).formData();
      const file = form.get("file"), label = form.get("label"), position = form.get("sortOrder");
      if (!(file instanceof File) || !["image/jpeg", "image/png"].includes(file.type) || file.size === 0 || file.size > 2 * 1024 * 1024
        || typeof label !== "string" || !label.trim() || label.trim().length > 160 || /[\u0000-\u001f\u007f]/.test(label)
        || typeof position !== "string" || !/^\d{1,3}$/.test(position)) return failure(400, "Check the label, position and JPEG/PNG image (up to 2 MB).");
      const safe = new FormData(); safe.set("file", file, "banner-image"); safe.set("label", label.trim()); safe.set("sortOrder", position);
      body = safe;
    } else if (request.method === "PUT") {
      if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return failure(415, "JSON is required.");
      const parsed = bannerUpdateSchema.safeParse(JSON.parse(new TextDecoder().decode(await boundedBody(request.body, 4096))));
      if (!parsed.success) return failure(400, "Check the banner fields and reload before saving.");
      body = JSON.stringify(parsed.data); outgoing = { "Content-Type": "application/json" };
    }
    const upstream = await authenticatedApiFetch(request, target, { method: request.method, body, headers: outgoing }, 15_000, 2 * 1024 * 1024 + 1024);
    if (!upstream.ok) {
      await upstream.body?.cancel();
      const status = [400, 401, 403, 404, 409, 413, 429].includes(upstream.status) ? upstream.status : 503;
      return failure(status, status === 401 ? "Administrator session expired. Sign in again." : status === 403
        ? "Platform administrator access is required to change banners." : status === 404
          ? "Banner not found. Refresh the list." : status === 409
          ? "Banner changed or inventory is full. Refresh before retrying." : status === 400 || status === 413
            ? "Check the banner label, position and valid JPEG/PNG image (up to 2 MB)." : "Banner service is unavailable. No success is assumed.");
    }
    if (request.method === "DELETE") { await upstream.body?.cancel(); return new NextResponse(null, { status: 204, headers }); }
    if (path[1] === "image") {
      const type = upstream.headers.get("content-type")?.split(";")[0];
      if (!type || !["image/jpeg", "image/png"].includes(type)) return failure(502, "Invalid banner image response.");
      return new NextResponse(await upstream.arrayBuffer(), { headers: { ...headers, "Content-Type": type } });
    }
    return NextResponse.json(await upstream.json(), { headers });
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "Sign in with your administrator account.")
      : error instanceof LimitError ? failure(413, "Banner upload is too large.")
      : error instanceof SyntaxError || error instanceof TypeError ? failure(400, "Invalid banner request.")
      : failure(503, "Banner connection unavailable. Refresh before retrying an upload.");
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
