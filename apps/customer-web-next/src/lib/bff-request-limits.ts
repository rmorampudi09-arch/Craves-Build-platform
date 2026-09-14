import { NextRequest, NextResponse } from "next/server";
import { DocumentTransportError, readDocumentBytes } from "./document-transport";
import { isSameOrigin } from "./request-security";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };
const JSON_BYTES = 64 * 1024;
const MULTIPART_BYTES = 10 * 1024 * 1024;
let jsonReads = 0;
let uploadReads = 0;

function rejected(status: number, code: string): NextResponse {
  return NextResponse.json({ code }, { status, headers: PRIVATE_HEADERS });
}

/** Read the actual stream once, before framework JSON/multipart buffering. */
export async function boundBffRequest(request: NextRequest, options: { maxBytes?: number; timeoutMs?: number } = {}): Promise<NextRequest | NextResponse> {
  if (!isSameOrigin(request)) return rejected(403, "ORIGIN_REJECTED");
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const multipart = contentType.startsWith("multipart/form-data;");
  if (multipart && !/^\/api\/chef\/(?:application\/proof-files|menu\/[0-9a-f-]{36}\/images)$/.test(request.nextUrl.pathname)) {
    return rejected(415, "JSON_REQUIRED");
  }
  if (request.body && !multipart && !/^application\/json(?:\s*;|$)/.test(contentType)) {
    return rejected(415, "JSON_REQUIRED");
  }
  const encoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  if (encoding && encoding !== "identity") return rejected(415, "CONTENT_ENCODING_NOT_SUPPORTED");
  const limit = Math.min(multipart ? MULTIPART_BYTES : JSON_BYTES, options.maxBytes ?? Number.MAX_SAFE_INTEGER);
  const timeoutMs = Math.min(multipart ? 15_000 : 5_000, options.timeoutMs ?? Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("INVALID_REQUEST_LIMIT_CONFIGURATION");
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    return rejected(413, "REQUEST_BODY_TOO_LARGE");
  }
  if ((multipart ? uploadReads >= 2 : jsonReads >= 16)) return rejected(429, "REQUEST_READER_BUSY");
  if (multipart) uploadReads += 1; else jsonReads += 1;
  try {
    const bytes = await readDocumentBytes(request.body, limit, timeoutMs);
    const headers = new Headers(request.headers);
    headers.delete("transfer-encoding");
    headers.set("content-length", String(bytes.byteLength));
    return new NextRequest(request, {
      headers,
      body: bytes.buffer as ArrayBuffer,
    });
  } catch (error) {
    if (error instanceof DocumentTransportError) {
      return rejected(error.status === 413 ? 413 : 408,
        error.status === 413 ? "REQUEST_BODY_TOO_LARGE" : "REQUEST_BODY_TIMEOUT");
    }
    return rejected(400, "INVALID_REQUEST_BODY");
  } finally {
    if (multipart) uploadReads -= 1; else jsonReads -= 1;
  }
}
