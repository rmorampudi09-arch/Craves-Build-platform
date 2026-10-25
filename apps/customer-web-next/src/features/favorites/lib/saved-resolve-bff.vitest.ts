// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const authenticated = vi.hoisted(() => vi.fn());
const publicFetch = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: authenticated,
}));
vi.mock("@/shared/lib/public-api", () => ({ publicApiFetch: publicFetch }));
import { POST as resolveSaved } from "@/app/api/discovery/saved/menu-items/resolve/route";
import { POST as resolveHomes } from "@/app/api/discovery/favorites/home/resolve/route";
import { SessionRequiredError } from "@/shared/lib/server-api";
import {
  resolveFavoriteHomes,
  resolveSavedMenuItems,
  SavedResolveError,
} from "@/features/favorites/api/savedResolve";

const DISH = "11111111-1111-4111-8111-111111111111";
const KITCHEN = "6b000000-0000-4000-8000-000000000001";
const CHEF = "c4000000-0000-4000-8000-000000000001";
const AT = "2026-10-15T08:00:00Z";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function saved(menuItemId: string, overrides: Record<string, unknown> = {}) {
  return {
    menuItemId,
    found: true,
    availabilityState: "AVAILABLE_NOW",
    evaluatedAt: AT,
    itemName: "Rajma",
    description: null,
    category: "MAIN_COURSE",
    foodType: "VEG",
    price: 180,
    currency: "INR",
    itemStatus: "ACTIVE",
    itemAvailable: true,
    kitchenId: KITCHEN,
    kitchenName: "Asha",
    kitchenDisplayName: null,
    kitchenStatus: "ACTIVE",
    areaName: null,
    city: "Hyderabad",
    state: "Telangana",
    primaryImageUrl: "https://img.craves.in/a.jpg",
    timezoneId: "Asia/Kolkata",
    scheduleConfigured: true,
    acceptingOrders: true,
    paused: false,
    availableNow: true,
    nextAvailabilityAt: null,
    ...overrides,
  };
}

function card(
  requestedType: "CHEF" | "KITCHEN",
  requestedId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    requestedType,
    requestedId,
    exists: true,
    kitchenId: KITCHEN,
    chefIdentityId: CHEF,
    kitchenName: "Asha",
    displayName: null,
    kitchenStatus: "ACTIVE",
    areaName: "Kondapur",
    city: "Hyderabad",
    state: "Telangana",
    activeAvailableDishCount: 2,
    menuPreview: [],
    timezoneId: "Asia/Kolkata",
    scheduleConfigured: true,
    acceptingOrders: true,
    paused: false,
    cookingState: "COOKING_NOW",
    nextAvailabilityAt: null,
    evaluatedAt: AT,
    ...overrides,
  };
}

function request(path: string, body: unknown, origin = "https://craves.in") {
  const text = JSON.stringify(body);
  return new NextRequest(`https://craves.in${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(text.length), origin },
    body: text,
  });
}

const savedPath = "/api/discovery/saved/menu-items/resolve";
const homePath = "/api/discovery/favorites/home/resolve";

beforeEach(() => {
  authenticated.mockReset();
  publicFetch.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saved dishes resolve BFF", () => {
  it("accepts 1 to 100 dish ids from this site only", async () => {
    for (const body of [
      {},
      { menuItemIds: [] },
      { menuItemIds: ["nope"] },
      { menuItemIds: [DISH], extra: 1 },
      { menuItemIds: Array.from({ length: 101 }, (_, n) => id(n)) },
    ]) {
      expect((await resolveSaved(request(savedPath, body))).status).toBe(400);
    }
    expect(
      (await resolveSaved(request(savedPath, { menuItemIds: [DISH] }, "https://evil.example")))
        .status,
    ).toBe(403);
    expect(publicFetch).not.toHaveBeenCalled();
  });

  it("returns today's facts and shows only https photos", async () => {
    publicFetch.mockResolvedValueOnce(
      Response.json({
        evaluatedAt: AT,
        items: [saved(DISH, { primaryImageUrl: "http://img.craves.in/a.jpg" })],
      }),
    );
    const response = await resolveSaved(request(savedPath, { menuItemIds: [DISH] }));
    expect([response.status, response.headers.get("cache-control")]).toEqual([200, "no-store"]);
    const body = await response.json();
    expect(body.items[0]).toMatchObject({
      menuItemId: DISH,
      primaryImageUrl: null,
      availabilityState: "AVAILABLE_NOW",
    });
    expect(body.items[0]).not.toHaveProperty("description");
    expect(publicFetch.mock.calls[0][0]).toBe("/discovery/saved/menu-items/resolve");
    expect(JSON.parse(publicFetch.mock.calls[0][1].body)).toEqual({ menuItemIds: [DISH] });

    // An oversized photo URL drops only that photo, never the whole list.
    publicFetch.mockResolvedValueOnce(
      Response.json({
        items: [saved(DISH, { primaryImageUrl: `https://img.craves.in/${"a".repeat(2000)}.jpg` })],
      }),
    );
    const long = await resolveSaved(request(savedPath, { menuItemIds: [DISH] }));
    expect([long.status, (await long.json()).items[0].primaryImageUrl]).toEqual([200, null]);
  });

  it("rejects a response it can't trust and maps upstream failures", async () => {
    publicFetch.mockResolvedValueOnce(
      Response.json({ items: [saved(DISH, { availabilityState: "SOMETIMES" })] }),
    );
    expect((await resolveSaved(request(savedPath, { menuItemIds: [DISH] }))).status).toBe(502);
    publicFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    const missing = await resolveSaved(request(savedPath, { menuItemIds: [DISH] }));
    expect([missing.status, await missing.json()]).toEqual([
      404,
      { code: "FEATURE_NOT_AVAILABLE" },
    ]);
    publicFetch.mockResolvedValueOnce(
      Response.json({ code: "TOO_MANY_MENU_ITEMS" }, { status: 400 }),
    );
    expect(await (await resolveSaved(request(savedPath, { menuItemIds: [DISH] }))).json()).toEqual({
      code: "TOO_MANY_MENU_ITEMS",
    });
    publicFetch.mockRejectedValueOnce(new Error("timeout"));
    expect((await resolveSaved(request(savedPath, { menuItemIds: [DISH] }))).status).toBe(503);
  });
});

describe("favorite homes resolve BFF", () => {
  it("accepts 1 to 100 chef and kitchen ids in total", async () => {
    for (const body of [
      { chefIdentityIds: [], kitchenIds: [] },
      { chefIdentityIds: [CHEF] },
      { chefIdentityIds: ["x"], kitchenIds: [] },
      {
        chefIdentityIds: Array.from({ length: 60 }, (_, n) => id(n)),
        kitchenIds: Array.from({ length: 41 }, (_, n) => id(n + 60)),
      },
    ]) {
      expect((await resolveHomes(request(homePath, body))).status).toBe(400);
    }
    expect(
      (
        await resolveHomes(
          request(homePath, { chefIdentityIds: [CHEF], kitchenIds: [] }, "https://evil.example"),
        )
      ).status,
    ).toBe(403);
    expect(authenticated).not.toHaveBeenCalled();
  });

  it("asks as the signed-in customer and returns the cards", async () => {
    authenticated.mockResolvedValueOnce(
      Response.json({ evaluatedAt: AT, items: [card("CHEF", CHEF)] }),
    );
    const response = await resolveHomes(
      request(homePath, { chefIdentityIds: [CHEF], kitchenIds: [] }),
    );
    expect([response.status, response.headers.get("cache-control")]).toEqual([200, "no-store"]);
    expect((await response.json()).items[0]).toEqual({
      requestedType: "CHEF",
      requestedId: CHEF,
      exists: true,
      kitchenId: KITCHEN,
      chefIdentityId: CHEF,
      kitchenName: "Asha",
      displayName: null,
      areaName: "Kondapur",
      city: "Hyderabad",
      cookingState: "COOKING_NOW",
    });
    expect(authenticated.mock.calls[0][1]).toBe("/discovery/favorites/home/resolve");
  });

  it("maps a missing session, expired token and bad responses", async () => {
    authenticated.mockRejectedValueOnce(new SessionRequiredError("no cookie"));
    expect(
      await (
        await resolveHomes(request(homePath, { chefIdentityIds: [], kitchenIds: [KITCHEN] }))
      ).json(),
    ).toEqual({ code: "SESSION_EXPIRED" });
    authenticated.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(
      (await resolveHomes(request(homePath, { chefIdentityIds: [], kitchenIds: [KITCHEN] })))
        .status,
    ).toBe(401);
    authenticated.mockResolvedValueOnce(Response.json({ items: [card("KITCHEN", "not-a-uuid")] }));
    expect(
      (await resolveHomes(request(homePath, { chefIdentityIds: [], kitchenIds: [KITCHEN] })))
        .status,
    ).toBe(502);
    authenticated.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(
      (await resolveHomes(request(homePath, { chefIdentityIds: [], kitchenIds: [KITCHEN] })))
        .status,
    ).toBe(503);
  });
});

describe("saved resolve browser client", () => {
  function answer(
    reply: (body: {
      menuItemIds?: string[];
      chefIdentityIds?: string[];
      kitchenIds?: string[];
    }) => Response,
  ) {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
      reply(JSON.parse(String(init?.body))),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("asks 100 dishes at a time and keeps the saved order", async () => {
    const ids = Array.from({ length: 150 }, (_, n) => id(n));
    const fetch = answer((body) =>
      Response.json({
        items: [...body.menuItemIds!].reverse().map((menuItemId) => saved(menuItemId)),
      }),
    );
    const items = await resolveSavedMenuItems([...ids, ids[0]]);
    expect(
      fetch.mock.calls.map(([url, init]) => [
        url,
        init?.method,
        JSON.parse(String(init?.body)).menuItemIds.length,
      ]),
    ).toEqual([
      ["/api/discovery/saved/menu-items/resolve", "POST", 100],
      ["/api/discovery/saved/menu-items/resolve", "POST", 50],
    ]);
    expect(items.map((item) => item.menuItemId)).toEqual(ids);
  });

  it("treats a missing dish or a failed read as an error, never as an empty list", async () => {
    answer(() => Response.json({ items: [] }));
    await expect(resolveSavedMenuItems([DISH])).rejects.toMatchObject({
      code: "INCOMPLETE_SAVED_RESOLVE_RESPONSE",
    });
    answer(() => Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }));
    await expect(resolveSavedMenuItems([DISH])).rejects.toBeInstanceOf(SavedResolveError);
    await expect(resolveSavedMenuItems([])).resolves.toEqual([]);
  });

  it("sends chefs and kitchens together and returns one card per saved relation", async () => {
    const fetch = answer((body) =>
      Response.json({
        items: [
          ...body.kitchenIds!.map((kitchenId) => card("KITCHEN", kitchenId)),
          ...body.chefIdentityIds!.map((chefId) => card("CHEF", chefId)),
        ],
      }),
    );
    const cards = await resolveFavoriteHomes([CHEF], [KITCHEN]);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      chefIdentityIds: [CHEF],
      kitchenIds: [KITCHEN],
    });
    expect(cards.map((item) => `${item.requestedType}:${item.requestedId}`)).toEqual([
      `CHEF:${CHEF}`,
      `KITCHEN:${KITCHEN}`,
    ]);
  });
});
