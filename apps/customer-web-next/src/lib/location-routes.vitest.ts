import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), maps: vi.fn() }));
vi.mock("@/lib/public-api", () => ({ publicApiFetch: mocks.catalog }));
vi.mock("@/lib/server/azure-maps", () => ({ reverseGeocodeWithAzureMaps: mocks.maps }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

const address = { formattedAddress: "Fixture address", city: "Fixture city" };
function location(body: unknown = { latitude: 0, longitude: 0 }, headers: Record<string, string> = {}) {
  return new NextRequest("https://craves.in/api/location/reverse-geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://craves.in", ...headers },
    body: JSON.stringify(body),
  });
}

describe("kitchen discovery request boundary", () => {
  for (const query of [
    "", "latitude=0", "longitude=0", "latitude=&longitude=0", "latitude=%20&longitude=0",
    "latitude=0&longitude=", "latitude=0&longitude=%09", "latitude=0x10&longitude=0",
    "latitude=NaN&longitude=0", "latitude=Infinity&longitude=0", "latitude=90.001&longitude=0",
    "latitude=-90.001&longitude=0", "latitude=0&longitude=180.001", "latitude=0&longitude=-180.001",
    "latitude=0&latitude=1&longitude=0", "latitude=0&longitude=0&size=1&size=2",
    "latitude=0&longitude=0&unknown=1", "latitude=0&longitude=0&radiusMeters=",
    "latitude=0&longitude=0&radiusMeters=0", "latitude=0&longitude=0&radiusMeters=100001",
    "latitude=0&longitude=0&page=-1", "latitude=0&longitude=0&page=1.5",
    "latitude=0&longitude=0&page=1001", "latitude=0&longitude=0&page=9007199254740992",
    "latitude=0&longitude=0&size=0", "latitude=0&longitude=0&size=51",
    "latitude=0&longitude=0&size=1e1", `latitude=${"0".repeat(33)}&longitude=0`,
    `latitude=0&longitude=0&${"x".repeat(256)}`,
  ]) it(`denies invalid query without Catalog: ${query.slice(0, 70)}`, async () => {
    const { GET } = await import("../app/api/discovery/kitchens/route");
    const response = await GET(new NextRequest(`https://craves.in/api/discovery/kitchens?${query}`));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  for (const [latitude, longitude] of [[0, 0], [-90, -180], [90, 180], [0.0000001, -0.0000001]]) {
    it(`preserves legitimate coordinates ${latitude},${longitude} and defaults`, async () => {
      const { GET } = await import("../app/api/discovery/kitchens/route");
      mocks.catalog.mockResolvedValue(Response.json({ latitude, longitude, radiusMeters: 5_000,
        page: { page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false }, kitchens: [] }));
      const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
      expect((await GET(new NextRequest(`https://craves.in/api/discovery/kitchens?${params}`))).status).toBe(200);
      expect(mocks.catalog).toHaveBeenCalledWith(`/discovery/kitchens?${new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), radiusMeters: "5000", page: "0", size: "20" })}`);
    });
  }
  it("accepts the inclusive discovery bounds", async () => {
    const { GET } = await import("../app/api/discovery/kitchens/route");
    mocks.catalog.mockResolvedValue(Response.json({ latitude: 0, longitude: 0, radiusMeters: 100_000,
      page: { page: 1_000, size: 50, totalElements: 0, totalPages: 0, hasNext: false }, kitchens: [] }));
    const response = await GET(new NextRequest("https://craves.in/api/discovery/kitchens?latitude=0&longitude=0&radiusMeters=100000&page=1000&size=50"));
    expect(response.status).toBe(200);
    expect(mocks.catalog).toHaveBeenCalledOnce();
  });
});

describe("anonymous reverse geocoding bounded admission", () => {
  it("keeps zero coordinates valid without an authentication cookie", async () => {
    const { POST } = await import("../app/api/location/reverse-geocode/route");
    mocks.maps.mockResolvedValue(address);
    const response = await POST(location());
    expect(response.status).toBe(200);
    expect(mocks.maps).toHaveBeenCalledWith(0, 0);
    expect(await response.json()).toEqual(address);
  });

  it("rejects invalid coordinates before consuming the global provider budget", async () => {
    const { POST } = await import("../app/api/location/reverse-geocode/route");
    mocks.maps.mockResolvedValue(address);
    for (let i = 0; i < 40; i += 1) {
      expect((await POST(location({ latitude: "0", longitude: 0 }))).status).toBe(400);
    }
    for (const body of [null, {}, [], { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: null, longitude: 0 }]) {
      expect((await POST(location(body))).status).toBe(400);
    }
    expect(mocks.maps).not.toHaveBeenCalled();
    for (let i = 0; i < 30; i += 1) expect((await POST(location())).status).toBe(200);
    expect(mocks.maps).toHaveBeenCalledTimes(30);
  });

  it("cannot gain extra rolling budgets with spoofed forwarding headers", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { POST } = await import("../app/api/location/reverse-geocode/route");
    mocks.maps.mockResolvedValue(address);
    for (let i = 0; i < 30; i += 1) {
      expect((await POST(location(undefined, { "x-forwarded-for": `192.0.2.${i}`, "x-azure-clientip": `198.51.100.${i}` }))).status).toBe(200);
    }
    for (let i = 0; i < 10; i += 1) {
      const response = await POST(location(undefined, { "x-forwarded-for": `203.0.113.${i}`, "x-azure-clientip": `spoof-${i}` }));
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("60");
    }
    now += 59_999;
    expect((await POST(location())).status).toBe(429);
    expect(mocks.maps).toHaveBeenCalledTimes(30);
    now += 1;
    expect((await POST(location())).status).toBe(200);
    expect(mocks.maps).toHaveBeenCalledTimes(31);
  });

  it("limits concurrent calls to four and releases the slot on provider failure", async () => {
    const { POST } = await import("../app/api/location/reverse-geocode/route");
    const pending: Array<{ resolve: (value: unknown) => void; reject: (reason: Error) => void }> = [];
    mocks.maps.mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
    const active = Array.from({ length: 4 }, () => POST(location()));
    await vi.waitFor(() => expect(mocks.maps).toHaveBeenCalledTimes(4));
    const denied = await POST(location(undefined, { "x-forwarded-for": "new-value" }));
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("1");
    expect(mocks.maps).toHaveBeenCalledTimes(4);
    pending[0].reject(new Error("fixture private provider context"));
    expect((await active[0]).status).toBe(503);
    const replacement = POST(location());
    await vi.waitFor(() => expect(mocks.maps).toHaveBeenCalledTimes(5));
    for (const item of pending.slice(1)) item.resolve(address);
    expect((await replacement).status).toBe(200);
    expect((await Promise.all(active.slice(1))).every(response => response.status === 200)).toBe(true);
  });

  it("counts failed provider starts but never logs or returns their private context", async () => {
    const { POST } = await import("../app/api/location/reverse-geocode/route");
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.maps.mockRejectedValue(new Error("fixture bearer token and provider address"));
    for (let i = 0; i < 30; i += 1) {
      const response = await POST(location());
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("fixture bearer");
    }
    expect((await POST(location())).status).toBe(429);
    expect(mocks.maps).toHaveBeenCalledTimes(30);
    expect(logger).not.toHaveBeenCalled();
  });

  it("denies cross-origin and oversized requests without any provider call", async () => {
    const { POST } = await import("../app/api/location/reverse-geocode/route");
    expect((await POST(location(undefined, { Origin: "https://attacker.invalid" }))).status).toBe(403);
    expect((await POST(location({ latitude: 0, longitude: 0, padding: "x".repeat(1_025) }))).status).toBe(413);
    expect(mocks.maps).not.toHaveBeenCalled();
  });
});
