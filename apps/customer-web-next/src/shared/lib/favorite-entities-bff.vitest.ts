// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({ ...await original<typeof import("@/shared/lib/server-api")>(), authenticatedApiFetch: upstream }));
import { GET as listKitchens } from "@/app/api/customer/favorite-kitchens/route";
import { DELETE as removeKitchen, PUT as saveKitchen } from "@/app/api/customer/favorite-kitchens/[kitchenId]/route";
import { GET as listChefs } from "@/app/api/customer/favorite-chefs/route";
import { DELETE as removeChef, PUT as saveChef } from "@/app/api/customer/favorite-chefs/[chefIdentityId]/route";
import { GET as listWatches } from "@/app/api/customer/favorite-watches/route";
import { PUT as setWatch } from "@/app/api/customer/favorite-watches/[entityType]/[entityId]/route";
import { FavoriteEntityError, listFavoriteChefs, listFavoriteWatches, setFavoriteChef, setFavoriteKitchen, setFavoriteWatch } from "./favorite-entities-client";

const KITCHEN = "6b000000-0000-4000-8000-000000000001";
const CHEF = "c4000000-0000-4000-8000-000000000001";
const AT = "2026-10-10T08:00:00Z";
const watch = { entityType: "CHEF", entityId: CHEF, channel: "IN_APP", enabled: true, lastNotifiedAt: null, lastNotificationWindowKey: "w1", createdAt: AT, updatedAt: AT };
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

function request(path: string, init: { method?: string; body?: unknown; origin?: string } = {}) {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return new NextRequest(`https://craves.in${path}`, {
    method: init.method ?? "GET",
    headers: { ...(body ? { "content-type": "application/json", "content-length": String(body.length) } : {}), origin: init.origin ?? "https://craves.in" },
    body,
  });
}

beforeEach(() => upstream.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("favorite kitchens and chefs BFF", () => {
  it("lists the first 100 saved kitchens and chefs", async () => {
    upstream.mockResolvedValueOnce(Response.json({ items: [{ kitchenId: KITCHEN, createdAt: AT }], nextCursor: null }));
    const kitchens = await listKitchens(request("/api/customer/favorite-kitchens"));
    expect([kitchens.status, kitchens.headers.get("cache-control"), upstream.mock.calls[0][1]]).toEqual([200, "no-store", "/customer/favorite-kitchens?limit=100"]);
    upstream.mockResolvedValueOnce(Response.json({ items: [{ chefIdentityId: "nope", createdAt: AT }], nextCursor: null }));
    expect((await listChefs(request("/api/customer/favorite-chefs"))).status).toBe(502);
  });

  it("saves and removes by uuid only, from this site only", async () => {
    expect((await saveKitchen(request("/api/customer/favorite-kitchens/x", { method: "PUT" }), params({ kitchenId: "x" }))).status).toBe(400);
    expect((await removeChef(request(`/api/customer/favorite-chefs/${CHEF}`, { method: "DELETE", origin: "https://evil.example" }), params({ chefIdentityId: CHEF }))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValueOnce(Response.json({ kitchenId: KITCHEN, createdAt: AT }));
    expect((await saveKitchen(request(`/api/customer/favorite-kitchens/${KITCHEN}`, { method: "PUT" }), params({ kitchenId: KITCHEN }))).status).toBe(200);
    expect(upstream.mock.calls[0].slice(1)).toEqual([`/customer/favorite-kitchens/${KITCHEN}`, { method: "PUT" }]);
    upstream.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await removeKitchen(request(`/api/customer/favorite-kitchens/${KITCHEN}`, { method: "DELETE" }), params({ kitchenId: KITCHEN }))).status).toBe(204);
    upstream.mockResolvedValueOnce(Response.json({ chefIdentityId: KITCHEN, createdAt: AT }));
    expect((await saveChef(request(`/api/customer/favorite-chefs/${CHEF}`, { method: "PUT" }), params({ chefIdentityId: CHEF }))).status).toBe(502);
  });

  it("maps a missing gateway route to Coming soon and keeps real codes", async () => {
    upstream.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    const missing = await listKitchens(request("/api/customer/favorite-kitchens"));
    expect([missing.status, await missing.json()]).toEqual([404, { code: "FEATURE_NOT_AVAILABLE" }]);
    upstream.mockResolvedValueOnce(Response.json({ code: "APPROVED_CHEF_NOT_FOUND" }, { status: 404 }));
    expect(await (await saveChef(request(`/api/customer/favorite-chefs/${CHEF}`, { method: "PUT" }), params({ chefIdentityId: CHEF }))).json()).toEqual({ code: "APPROVED_CHEF_NOT_FOUND" });
  });
});

describe("favorite watches BFF", () => {
  it("requires CHEF or KITCHEN and returns only that type", async () => {
    expect((await listWatches(request("/api/customer/favorite-watches"))).status).toBe(400);
    expect((await listWatches(request("/api/customer/favorite-watches?entityType=MENU_ITEM"))).status).toBe(400);
    upstream.mockResolvedValueOnce(Response.json([watch]));
    const response = await listWatches(request("/api/customer/favorite-watches?entityType=CHEF"));
    expect((await response.json())[0]).not.toHaveProperty("lastNotificationWindowKey");
    expect(upstream.mock.calls[0][1]).toBe("/customer/favorite-watches?entityType=CHEF&limit=100");
    upstream.mockResolvedValueOnce(Response.json([watch]));
    expect((await listWatches(request("/api/customer/favorite-watches?entityType=KITCHEN"))).status).toBe(502);
  });

  it("always asks for in-app notifications and validates the body", async () => {
    const path = `/api/customer/favorite-watches/CHEF/${CHEF}`;
    for (const body of [{}, { enabled: "yes" }, { enabled: true, channel: "PUSH" }]) {
      expect((await setWatch(request(path, { method: "PUT", body }), params({ entityType: "CHEF", entityId: CHEF }))).status).toBe(400);
    }
    expect((await setWatch(request(path, { method: "PUT", body: { enabled: true } }), params({ entityType: "MENU_ITEM", entityId: CHEF }))).status).toBe(400);
    expect((await setWatch(request(path, { method: "PUT", body: { enabled: true } }), params({ entityType: "CHEF", entityId: "x" }))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValueOnce(Response.json({ ...watch, enabled: false }));
    const response = await setWatch(request(path, { method: "PUT", body: { enabled: false } }), params({ entityType: "CHEF", entityId: CHEF }));
    expect((await response.json()).enabled).toBe(false);
    expect(upstream.mock.calls[0][1]).toBe(`/customer/favorite-watches/CHEF/${CHEF}`);
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual({ channel: "IN_APP", enabled: false });
  });
});

describe("favorite entities browser client", () => {
  function answer(body: unknown, status = 200) {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => body === null ? new Response(null, { status }) : Response.json(body, { status }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("uses PUT to save, DELETE to remove, and same-origin credentials", async () => {
    const fetch = answer(null, 204);
    await setFavoriteChef(CHEF, false);
    await setFavoriteKitchen(KITCHEN, true);
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method, init?.credentials])).toEqual([
      [`/api/customer/favorite-chefs/${CHEF}`, "DELETE", "same-origin"],
      [`/api/customer/favorite-kitchens/${KITCHEN}`, "PUT", "same-origin"],
    ]);
    answer({ items: [{ chefIdentityId: CHEF, createdAt: AT }], nextCursor: null });
    expect((await listFavoriteChefs()).items[0].chefIdentityId).toBe(CHEF);
    const watches = answer([watch]);
    expect(await listFavoriteWatches("CHEF")).toHaveLength(1);
    expect(watches.mock.calls[0][0]).toBe("/api/customer/favorite-watches?entityType=CHEF");
    const put = answer(watch);
    expect((await setFavoriteWatch("CHEF", CHEF, true)).enabled).toBe(true);
    expect(put.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "PUT", body: JSON.stringify({ enabled: true }) }));
  });

  it("renews an expired access cookie once and retries", async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(Response.json({ code: "SESSION_EXPIRED" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await setFavoriteKitchen(KITCHEN, true);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`/api/customer/favorite-kitchens/${KITCHEN}`, "/api/auth/refresh", `/api/customer/favorite-kitchens/${KITCHEN}`]);
  });

  it.each([
    [401, { code: "AUTHENTICATION_REQUIRED" }, "SESSION_EXPIRED"],
    [404, { code: "FEATURE_NOT_AVAILABLE" }, "FEATURE_NOT_AVAILABLE"],
    [503, null, "FAVORITE_ENTITY_FAILED"],
  ])("turns a %s answer into FavoriteEntityError %s", async (status, body, code) => {
    answer(body, status);
    const error = await setFavoriteKitchen(KITCHEN, true).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FavoriteEntityError);
    expect([(error as FavoriteEntityError).code, (error as FavoriteEntityError).status]).toEqual([code, status]);
  });
});
