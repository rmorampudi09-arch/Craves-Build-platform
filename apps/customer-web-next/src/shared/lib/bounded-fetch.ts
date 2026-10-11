import { DocumentTransportError, readDocumentBytes } from "./document-transport";

/** Includes response-body consumption in the deadline and never follows redirects. */
export async function boundedFetch(
  input: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
  maxBytes = 2 * 1024 * 1024,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const upstream = await fetch(input, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal,
      redirect: "error",
      cache: "no-store",
    });
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) throw new DOMException("Upstream deadline exceeded", "AbortError");
    const bytes = await readDocumentBytes(upstream.body, maxBytes, remaining);
    const headers = new Headers(upstream.headers);
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    headers.set("content-length", String(bytes.byteLength));
    return new Response([204, 205, 304].includes(upstream.status) ? null : bytes.buffer as ArrayBuffer,
      { status: upstream.status, statusText: upstream.statusText, headers });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DocumentTransportError && error.status === 504)) {
      throw new DOMException("Upstream deadline exceeded", "AbortError");
    }
    // Preserve machine-only error categories, never upstream bodies/URLs/credentials.
    if (error instanceof DocumentTransportError) throw new Error("UPSTREAM_RESPONSE_TOO_LARGE");
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
