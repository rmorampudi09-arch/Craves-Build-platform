import { boundedFetch } from "./bounded-fetch";

/** Isolated launch metadata. This module never calls a Craves business service. */
export type WebLaunchState = {
  schema: 1;
  phase: "open" | "waiting" | "launched";
  updatedAt: string;
};
export type WebLaunchSnapshot = { state: WebLaunchState; etag: string };
export class WebLaunchUnavailable extends Error {
  constructor() { super("WEB_LAUNCH_UNAVAILABLE"); }
}

export function launchBlobUrl(): string | null {
  const value = process.env.CRAVES_WEB_LAUNCH_BLOB_URL;
  if (!value) return null;
  // Fixed private container: no arbitrary host, SAS token, or customer object.
  if (value !== "https://stcravesprodlowkmqgfy.blob.core.windows.net/web-pilot-launch/state.json") {
    throw new WebLaunchUnavailable();
  }
  return value;
}

export function parseWebLaunchState(value: unknown): WebLaunchState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WebLaunchUnavailable();
  const raw = value as Record<string, unknown>;
  if (raw.schema !== 1 || !["open", "waiting", "launched"].includes(String(raw.phase)) ||
      typeof raw.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw.updatedAt) ||
      !Number.isFinite(Date.parse(raw.updatedAt))) throw new WebLaunchUnavailable();
  return { schema: 1, phase: raw.phase as WebLaunchState["phase"], updatedAt: raw.updatedAt };
}

type Fetcher = typeof boundedFetch;
/** Injectable transport supports realistic storage failures without production credentials. */
export function createWebLaunchStore(fetcher: Fetcher = boundedFetch, clock: () => number = Date.now) {
  let credential: { token: string; expiresAt: number } | null = null;
  let credentialRead: Promise<string> | null = null;
  let cached: { snapshot: WebLaunchSnapshot; until: number } | null = null;
  let pending: Promise<WebLaunchSnapshot> | null = null;

  async function token(): Promise<string> {
    if (credential && credential.expiresAt > clock() + 60_000) return credential.token;
    if (credentialRead) return credentialRead;
    credentialRead = (async () => {
      const endpoint = process.env.IDENTITY_ENDPOINT;
      const header = process.env.IDENTITY_HEADER;
      if (!endpoint || !header) throw new WebLaunchUnavailable();
      const url = new URL(endpoint);
      // Container Apps injects a local identity endpoint; do not permit remote redirects.
      if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
        throw new WebLaunchUnavailable();
      }
      url.searchParams.set("resource", "https://storage.azure.com/");
      url.searchParams.set("api-version", "2019-08-01");
      const response = await fetcher(url.toString(), { headers: { "X-IDENTITY-HEADER": header } }, 2000, 16_384);
      if (!response.ok) throw new WebLaunchUnavailable();
      const raw = await response.json() as Record<string, unknown>;
      const expiresAt = Number(raw.expires_on) * 1000;
      if (typeof raw.access_token !== "string" || raw.access_token.length < 20 || !Number.isFinite(expiresAt) || expiresAt <= clock() + 60_000) {
        throw new WebLaunchUnavailable();
      }
      credential = { token: raw.access_token, expiresAt };
      return credential.token;
    })();
    try { return await credentialRead; }
    finally { credentialRead = null; }
  }

  async function blob(method: "GET" | "PUT", body?: WebLaunchState, etag?: string): Promise<Response> {
    const url = launchBlobUrl();
    if (!url) throw new WebLaunchUnavailable();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await token()}`,
      "x-ms-version": "2023-11-03",
      "x-ms-date": new Date(clock()).toUTCString(),
    };
    if (body) {
      headers["Content-Type"] = "application/json";
      headers["x-ms-blob-type"] = "BlockBlob";
      headers["x-ms-blob-cache-control"] = "no-store";
      headers["If-Match"] = etag!;
    }
    return fetcher(url, { method, headers, body: body ? JSON.stringify(body) : undefined }, 2000, 8192);
  }

  async function read(fresh = false): Promise<WebLaunchSnapshot> {
    if (!fresh && cached && cached.until > clock()) return cached.snapshot;
    if (!fresh && pending) return pending;
    const operation = (async () => {
      const started = clock();
      const response = await blob("GET");
      if (!response.ok) throw new WebLaunchUnavailable();
      const etag = response.headers.get("etag");
      if (!etag || etag.length > 160 || !/^"[^"\r\n]+"$/.test(etag)) throw new WebLaunchUnavailable();
      const snapshot = { state: parseWebLaunchState(await response.json()), etag };
      cached = { snapshot, until: started + 500 };
      return snapshot;
    })();
    if (!fresh) pending = operation;
    try { return await operation; }
    catch { throw new WebLaunchUnavailable(); }
    finally { if (pending === operation) pending = null; }
  }

  async function launch(): Promise<WebLaunchSnapshot> {
    // One-way, idempotent operation. The public control cannot close the website.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await read(true);
      if (current.state.phase === "launched") return current;
      const response = await blob("PUT", { schema: 1, phase: "launched", updatedAt: new Date(clock()).toISOString() }, current.etag);
      if (response.status === 412) continue;
      if (response.status !== 201) throw new WebLaunchUnavailable();
      cached = null;
      const verified = await read(true);
      if (verified.state.phase !== "launched") throw new WebLaunchUnavailable();
      return verified;
    }
    throw new WebLaunchUnavailable();
  }

  return { read, launch, lastKnown: () => cached?.snapshot ?? null };
}

export const webLaunchStore = createWebLaunchStore();
