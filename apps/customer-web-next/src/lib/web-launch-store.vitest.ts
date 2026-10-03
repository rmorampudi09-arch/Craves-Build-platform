import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebLaunchStore, parseWebLaunchState, type WebLaunchState } from "./web-launch-state";

const blobUrl = "https://stcravesprodlowkmqgfy.blob.core.windows.net/web-pilot-launch/state.json";
const epoch = Date.parse("2026-10-03T01:00:00.000Z");
beforeEach(() => {
  vi.stubEnv("CRAVES_WEB_LAUNCH_BLOB_URL", blobUrl);
  vi.stubEnv("IDENTITY_ENDPOINT", "http://127.0.0.1:42356/msi/token");
  vi.stubEnv("IDENTITY_HEADER", "disposable-test-identity-header");
});
afterEach(() => vi.unstubAllEnvs());

function fixture(initial: WebLaunchState["phase"] = "waiting") {
  let now = epoch;
  let state: WebLaunchState = { schema: 1, phase: initial, updatedAt: new Date(epoch).toISOString() };
  let version = 1;
  let outage = false;
  let conflict = false;
  const calls: { url: string; method: string; headers: Headers; timeout: number | undefined; maxBytes: number | undefined }[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit = {}, timeout?: number, maxBytes?: number) => {
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    calls.push({ url, method, headers, timeout, maxBytes });
    if (url.startsWith("http://127.0.0.1:")) {
      expect(headers.get("X-IDENTITY-HEADER")).toBe("disposable-test-identity-header");
      expect(new URL(url).searchParams.get("resource")).toBe("https://storage.azure.com/");
      return Response.json({ access_token: "disposable-test-storage-token", expires_on: String((now + 3600_000) / 1000) });
    }
    expect(url).toBe(blobUrl);
    expect(headers.get("Authorization")).toBe("Bearer disposable-test-storage-token");
    if (outage) throw new Error("simulated private transport failure");
    if (method === "GET") return Response.json(state, { headers: { ETag: `"v${version}"` } });
    if (conflict) { conflict = false; version += 1; return new Response(null, { status: 412 }); }
    expect(headers.get("If-Match")).toBe(`"v${version}"`);
    expect(headers.get("x-ms-blob-type")).toBe("BlockBlob");
    expect(headers.get("x-ms-blob-cache-control")).toBe("no-store");
    state = parseWebLaunchState(JSON.parse(String(init.body)));
    version += 1;
    return new Response(null, { status: 201 });
  });
  const store = createWebLaunchStore(fetcher, () => now);
  return { store, calls, fetcher, tick: (ms: number) => { now += ms; }, outage: () => { outage = true; }, conflict: () => { conflict = true; }, state: () => state };
}

describe("Web-only durable launch state", () => {
  it("opens exactly the dedicated blob and verifies persistence before success", async () => {
    const f = fixture();
    const result = await f.store.launch();
    expect(result.state.phase).toBe("launched");
    expect(f.state().phase).toBe("launched");
    expect(f.calls.map(c => c.method)).toEqual(["GET", "GET", "PUT", "GET"]);
    expect(f.calls.every(c => c.timeout === 2000 && (c.maxBytes === 8192 || c.maxBytes === 16384))).toBe(true);
    const writes = f.calls.filter(c => c.method === "PUT").length;
    await f.store.launch();
    expect(f.calls.filter(c => c.method === "PUT")).toHaveLength(writes);
  });
  it("retries an ETag conflict without overwriting stale state", async () => {
    const f = fixture(); f.conflict();
    expect((await f.store.launch()).state.phase).toBe("launched");
    expect(f.calls.filter(c => c.method === "PUT").map(c => c.headers.get("If-Match"))).toEqual(['"v1"', '"v2"']);
  });
  it("coalesces reads for only half a second and retains the last known state on failure", async () => {
    const f = fixture();
    await Promise.all([f.store.read(), f.store.read(), f.store.read()]);
    expect(f.calls).toHaveLength(2);
    f.tick(499); await f.store.read(); expect(f.calls).toHaveLength(2);
    f.tick(2); await f.store.read(); expect(f.calls).toHaveLength(3);
    f.outage(); f.tick(501);
    await expect(f.store.read()).rejects.toThrow("WEB_LAUNCH_UNAVAILABLE");
    await expect(f.store.launch()).rejects.toThrow("WEB_LAUNCH_UNAVAILABLE");
    expect(f.store.lastKnown()?.state.phase).toBe("waiting");
    expect(f.calls.filter(c => c.method === "PUT")).toHaveLength(0);
  });
  it("refreshes expiring managed credentials and never allows arbitrary storage targets", async () => {
    const f = fixture("open"); await f.store.read(); f.tick(3_550_000); await f.store.read();
    expect(f.calls.filter(c => c.url.startsWith("http:"))).toHaveLength(2);
    vi.stubEnv("CRAVES_WEB_LAUNCH_BLOB_URL", "https://attacker.invalid/state.json");
    f.tick(501); await expect(f.store.read()).rejects.toThrow("WEB_LAUNCH_UNAVAILABLE");
    expect(f.calls.some(c => c.url.startsWith("https://attacker"))).toBe(false);
  });
  it("refuses remote identity endpoints and malformed state", async () => {
    vi.stubEnv("IDENTITY_ENDPOINT", "https://attacker.invalid/token");
    const f = fixture(); await expect(f.store.read()).rejects.toThrow("WEB_LAUNCH_UNAVAILABLE");
    expect(f.fetcher).not.toHaveBeenCalled();
    for (const invalid of [null, [], {}, { schema: 1, phase: "closed", updatedAt: new Date(epoch).toISOString() }, { schema: 1, phase: "open", updatedAt: "unknown" }]) {
      expect(() => parseWebLaunchState(invalid)).toThrow("WEB_LAUNCH_UNAVAILABLE");
    }
  });
});
