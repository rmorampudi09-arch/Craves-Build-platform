import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedFetch } from "./bounded-fetch";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("bounded upstream transport", () => {
  it("preserves checked responses while disallowing redirects", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ready: true }, { headers: { "X-Craves-Test": "fixture" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await boundedFetch("https://api.craves.invalid/me");
    expect(await response.json()).toEqual({ ready: true });
    expect(response.headers.get("x-craves-test")).toBe("fixture");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", cache: "no-store" });
  });
  it("rejects aggregate oversized response data", async () => {
    vi.stubGlobal("fetch", async () => new Response("x".repeat(101)));
    await expect(boundedFetch("https://api.craves.invalid/me", {}, 1000, 100)).rejects.toThrow("UPSTREAM_RESPONSE_TOO_LARGE");
  });
  it("keeps the deadline active after response headers arrive", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([123])); } })));
    const result = boundedFetch("https://api.craves.invalid/me", {}, 100).catch(error => error);
    await vi.advanceTimersByTimeAsync(101);
    expect(await result).toMatchObject({ name: "AbortError" });
  });
  it("preserves bodyless upstream status", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 204 }));
    const response = await boundedFetch("https://api.craves.invalid/me");
    expect(response.status).toBe(204); expect(await response.text()).toBe("");
  });
});
