export class DocumentTransportError extends Error {
  public readonly status: number;
  public readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

export async function readDocumentBytes(body: ReadableStream<Uint8Array> | null, limit: number, timeoutMs: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new DocumentTransportError(504, "DOCUMENT_BODY_TIMEOUT"));
      void reader.cancel().catch(() => undefined);
    }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) { void reader.cancel().catch(() => undefined); throw new DocumentTransportError(413, "DOCUMENT_BODY_TOO_LARGE"); }
        chunks.push(value);
      }
      const output = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
      return output;
    })()]);
  } finally { if (timer) clearTimeout(timer); reader.releaseLock(); }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type DocumentRoute = "list" | "create" | "capabilities" | "detail" | "download" | "email" | "emails";
export function documentRoute(method: string, segments: string[]): DocumentRoute | null {
  if (segments.length === 0) return method === "GET" ? "list" : method === "POST" ? "create" : null;
  if (segments.length === 1 && segments[0] === "capabilities") return method === "GET" ? "capabilities" : null;
  if (!uuid.test(segments[0] ?? "")) return null;
  if (segments.length === 1) return method === "GET" ? "detail" : null;
  if (segments.length !== 2) return null;
  if (method === "GET" && segments[1] === "download") return "download";
  if (method === "GET" && segments[1] === "emails") return "emails";
  return method === "POST" && segments[1] === "email" ? "email" : null;
}
export function documentQuery(route: DocumentRoute, input: URLSearchParams): string {
  const keys = Array.from(input.keys());
  if (new Set(keys).size !== keys.length) throw new DocumentTransportError(400, "DUPLICATE_QUERY_PARAMETER");
  if (route !== "list" && keys.length) throw new DocumentTransportError(400, "UNEXPECTED_QUERY_PARAMETER");
  const allowed = new Set(["limit", "cursor", "type", "reference"]);
  for (const key of keys) if (!allowed.has(key)) throw new DocumentTransportError(400, "UNEXPECTED_QUERY_PARAMETER");
  const limit = input.get("limit");
  if (limit !== null && (!/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50)) throw new DocumentTransportError(400, "INVALID_PAGE_SIZE");
  if ((input.get("cursor")?.length ?? 0) > 180 || (input.get("reference")?.length ?? 0) > 160 || (input.get("type")?.length ?? 0) > 40) throw new DocumentTransportError(400, "INVALID_QUERY_PARAMETER");
  const query = input.toString();
  return query ? `?${query}` : "";
}
