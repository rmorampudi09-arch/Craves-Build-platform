// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/public-api", () => ({ publicApiFetch: upstream }));
import { GET } from "@/app/api/catalog/kitchens/[kitchenId]/route";
import { getKitchenProfile } from "./kitchen-profile-client";

const KITCHEN = "4a000000-0000-4000-8000-000000000001";
const kitchen = { id: KITCHEN, kitchenName: "Asha's Kitchen", displayName: null, description: null, areaName: null, city: "Hyderabad", state: "Telangana", status: "ACTIVE", createdAt: null, chefPhotoUrl: "http://craves.in/chef.jpg", kitchenPhotoUrls: ["https://craves.in/k1.jpg"], phoneNumber: null };
const read = (id: string) => GET(new NextRequest(`https://craves.in/api/catalog/kitchens/${id}`), { params: Promise.resolve({ kitchenId: id }) });

beforeEach(() => { upstream.mockReset(); }); // braces: a returned function would run as teardown
afterEach(() => vi.unstubAllGlobals());

describe("public kitchen profile BFF", () => {
  it("returns only the parsed public profile, uncached", async () => {
    upstream.mockResolvedValue(Response.json(kitchen));
    const response = await read(KITCHEN);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ id: KITCHEN, kitchenName: "Asha's Kitchen", displayName: null, description: null, areaName: null, city: "Hyderabad", state: "Telangana", status: "ACTIVE", createdAt: null, chefPhotoUrl: null, kitchenPhotoUrls: ["https://craves.in/k1.jpg"] });
    expect(upstream).toHaveBeenCalledWith(`/catalog/kitchens/${KITCHEN}`);
  });

  it.each([
    ["a bad id", () => undefined, "nope", 400, "INVALID_KITCHEN_ID"],
    ["a missing kitchen", () => upstream.mockResolvedValue(Response.json({ code: "KITCHEN_NOT_FOUND" }, { status: 404 })), KITCHEN, 404, "KITCHEN_NOT_FOUND"],
    ["a broken contract", () => upstream.mockResolvedValue(Response.json({ ...kitchen, status: "LIVE" })), KITCHEN, 502, "INVALID_KITCHEN_PROFILE_RESPONSE"],
    ["another kitchen", () => upstream.mockResolvedValue(Response.json({ ...kitchen, id: "4a000000-0000-4000-8000-000000000002" })), KITCHEN, 502, "INVALID_KITCHEN_PROFILE_RESPONSE"],
    ["an upstream failure", () => upstream.mockResolvedValue(new Response(null, { status: 500 })), KITCHEN, 503, "KITCHEN_PROFILE_UNAVAILABLE"],
    ["a network failure", () => upstream.mockRejectedValue(new TypeError("fetch failed")), KITCHEN, 503, "KITCHEN_PROFILE_UNAVAILABLE"],
  ])("answers %s", async (_name, arrange, id, status, code) => {
    arrange();
    const response = await read(id);
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });
});

describe("kitchen profile browser client", () => {
  function answer(byId: Record<string, [number, unknown]>) {
    const fetch = vi.fn(async (url: string) => {
      const [status, body] = byId[url.split("/").pop()!] ?? [404, { code: "KITCHEN_NOT_FOUND" }];
      return Response.json(body, { status });
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("makes one request per kitchen, shared by concurrent and later callers", async () => {
    const other = "4a000000-0000-4000-8000-000000000003";
    const fetch = answer({ [KITCHEN]: [200, { ...kitchen, chefPhotoUrl: null }], [other]: [200, { ...kitchen, id: other }] });
    const ids = [KITCHEN, other, KITCHEN.toUpperCase(), KITCHEN, other, "4a000000-0000-4000-8000-000000000004"];
    const profiles = await Promise.all(ids.map(getKitchenProfile));
    expect(profiles.map(profile => profile?.id ?? null)).toEqual([KITCHEN, other, KITCHEN, KITCHEN, other, null]);
    expect(await getKitchenProfile(KITCHEN)).toBe(profiles[0]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[0][0]).toBe(`/api/catalog/kitchens/${KITCHEN}`);
  });

  it("returns null for a bad id, throws on failures and retries after one", async () => {
    const flaky = "4a000000-0000-4000-8000-000000000005";
    answer({ nope: [400, { code: "INVALID_KITCHEN_ID" }], [flaky]: [503, { code: "KITCHEN_PROFILE_UNAVAILABLE" }] });
    expect(await getKitchenProfile("nope")).toBeNull();
    await expect(getKitchenProfile(flaky)).rejects.toThrow();
    const fetch = answer({ [flaky]: [200, { ...kitchen, id: flaky }] });
    expect((await getKitchenProfile(flaky))?.id).toBe(flaky);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
