import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("IDENTITY_ENDPOINT", "http://identity.invalid/token");
  vi.stubEnv("IDENTITY_HEADER", "fixture-identity-header");
  vi.stubEnv("AZURE_MAPS_CLIENT_ID", "fixture-client-id");
  vi.stubEnv("AZURE_MAPS_ENDPOINT", "https://maps.invalid");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

const token = () => Response.json({ access_token: "fixture-token", expires_on: Math.floor(Date.now() / 1_000) + 3_600 });
const result = () => Response.json({ features: [{ properties: { address: { formattedAddress: "Fixture address" } } }] });

describe("Azure Maps bounded transport without live requests", () => {
  it("disallows redirects for both credential-bearing requests and reuses the cached token", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(result()).mockResolvedValueOnce(result());
    vi.stubGlobal("fetch", fetcher);
    const { reverseGeocodeWithAzureMaps } = await import("./server/azure-maps");
    expect((await reverseGeocodeWithAzureMaps(0, 0)).formattedAddress).toBe("Fixture address");
    await reverseGeocodeWithAzureMaps(0, 0);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, init] of fetcher.mock.calls) expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(String(fetcher.mock.calls[0][0])).toContain("identity.invalid");
    expect(String(fetcher.mock.calls[1][0])).toContain("coordinates=0%2C0");
  });

  it("rejects oversized identity output before any Maps request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("x".repeat(32 * 1_024 + 1)));
    vi.stubGlobal("fetch", fetcher);
    const { reverseGeocodeWithAzureMaps } = await import("./server/azure-maps");
    await expect(reverseGeocodeWithAzureMaps(0, 0)).rejects.toThrow("UPSTREAM_RESPONSE_TOO_LARGE");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized Maps response bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response("x".repeat(256 * 1_024 + 1))));
    const { reverseGeocodeWithAzureMaps } = await import("./server/azure-maps");
    await expect(reverseGeocodeWithAzureMaps(0, 0)).rejects.toThrow("UPSTREAM_RESPONSE_TOO_LARGE");
  });

  for (const stage of ["identity", "maps"]) it(`keeps the ${stage} deadline active after headers`, async () => {
    vi.useFakeTimers();
    const stalled = () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([123])); } }));
    const fetcher = vi.fn();
    if (stage === "maps") fetcher.mockResolvedValueOnce(token());
    fetcher.mockResolvedValueOnce(stalled());
    vi.stubGlobal("fetch", fetcher);
    const { reverseGeocodeWithAzureMaps } = await import("./server/azure-maps");
    const outcome = reverseGeocodeWithAzureMaps(0, 0).catch(error => error);
    await vi.advanceTimersByTimeAsync(stage === "identity" ? 5_001 : 7_001);
    expect(await outcome).toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(stage === "identity" ? 1 : 2);
  });
});
