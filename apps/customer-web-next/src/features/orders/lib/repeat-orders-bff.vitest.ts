// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
const menu = vi.hoisted(() => vi.fn());
const loadCart = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
vi.mock("@/features/dish/api/dishes", () => ({ loadKitchenMenu: menu }));
vi.mock("@/features/cart/api/cravesCart", () => ({ loadCart }));
import { GET } from "@/app/api/orders/repeat-candidates/route";
import { POST } from "@/app/api/cart/reorder-if-unchanged/[orderId]/route";
import { listRepeatOrders, orderLikeLastTime } from "@/features/orders/api/repeat-orders";
import type { RepeatOrderCandidate } from "./repeat-order-contract";

const ORDER = "0bde0000-0000-4000-8000-000000000101";
const KITCHEN = "4a000000-0000-4000-8000-000000000001";
const DISH = "0bde0000-0000-4000-8000-000000000201";
const CART = "0bde0000-0000-4000-8000-000000000401";
const candidate = {
  orderId: ORDER,
  kitchenId: KITCHEN,
  kitchenName: "Relangi",
  lastOrderedAt: "2026-10-10T07:12:00Z",
  completedOrdersFromKitchen: 3,
  items: [{ menuItemId: DISH, itemName: "Veg thali", quantity: 2 }],
  previousOrderTotal: "248.50",
  previousOrderCurrency: "INR",
  orderLikeLastTimeAvailable: true,
  preferenceRecallSupported: false,
  rememberedPreferenceCount: 0,
  currentValidationNotice: "Validated when rebuilding the cart.",
};
const page = { items: [candidate], nextCursor: null, hasMore: false };
const cartLine = {
  id: "0bde0000-0000-4000-8000-000000000301",
  menuItemId: DISH,
  kitchenId: KITCHEN,
  itemName: "Veg thali",
  kitchenName: "Relangi",
  unitPrice: 120,
  currency: "INR",
  quantity: 2,
  lineTotal: 240,
  createdAt: "2026-10-15T08:00:00Z",
  updatedAt: "2026-10-15T08:00:00Z",
};
const cart = {
  id: CART,
  customerIdentityId: "0bde0000-0000-4000-8000-000000000501",
  currency: "INR",
  items: [cartLine],
  totals: { foodSubtotal: 240, currency: "INR" },
};
const reorderBody = { expectedCart: { cartId: CART, items: [] }, expectedKitchenId: KITCHEN };

const list = (query = "") =>
  GET(new NextRequest(`https://craves.in/api/orders/repeat-candidates${query}`));
function reorder(orderId: string, body: unknown = reorderBody, origin = "https://craves.in") {
  const text = JSON.stringify(body);
  return POST(
    new NextRequest(`https://craves.in/api/cart/reorder-if-unchanged/${orderId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(text.length),
        origin,
      },
      body: text,
    }),
    { params: Promise.resolve({ orderId }) },
  );
}

beforeEach(() => {
  upstream.mockReset();
  menu.mockReset();
  loadCart.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("repeat order candidates BFF", () => {
  it("validates the query before calling the order service", async () => {
    for (const query of [
      "?limit=0",
      "?limit=51",
      "?limit=abc",
      `?cursor=${"c".repeat(513)}`,
      "?cursor=",
      "?cursor=a..b",
    ]) {
      expect((await list(query)).status, query).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards limit and cursor and returns the parsed page, uncached", async () => {
    upstream.mockResolvedValue(Response.json(page));
    const response = await list("?limit=05&cursor=a-b_C9");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).items[0]).not.toHaveProperty("rememberedPreferenceCount");
    expect(upstream.mock.calls[0][1]).toBe("/orders/repeat-candidates?limit=5&cursor=a-b_C9");
    await list();
    expect(upstream.mock.calls[1][1]).toBe("/orders/repeat-candidates?limit=20");
  });

  it.each([
    [new Response(null, { status: 404 }), 404, "FEATURE_NOT_AVAILABLE"],
    [Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }), 401, "SESSION_EXPIRED"],
    [new Response(null, { status: 403 }), 403, "REPEAT_ORDERS_FAILED"],
    [new Response(null, { status: 500 }), 503, "REPEAT_ORDERS_FAILED"],
    [Response.json({ ...page, hasMore: true }), 502, "INVALID_REPEAT_ORDERS_RESPONSE"],
  ])("maps an upstream %#", async (answer, status, code) => {
    upstream.mockResolvedValue(answer);
    const response = await list();
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });

  it("answers 503 when the order service can't be reached", async () => {
    upstream.mockRejectedValue(new TypeError("fetch failed"));
    expect((await list()).status).toBe(503);
  });
});

describe("conditional reorder BFF", () => {
  it("refuses another origin, a bad order id and a bad body without calling the order service", async () => {
    expect((await reorder(ORDER, reorderBody, "https://evil.example")).status).toBe(403);
    expect((await reorder("nope")).status).toBe(400);
    expect((await reorder(ORDER, { ...reorderBody, expectedKitchenId: "nope" })).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("sends the checked body and returns the rebuilt cart", async () => {
    upstream.mockResolvedValue(Response.json(cart));
    const response = await reorder(ORDER, { ...reorderBody, extra: true });
    expect(response.status).toBe(200);
    expect((await response.json()).items[0].id).toBe(cartLine.id);
    expect(upstream).toHaveBeenCalledWith(
      expect.anything(),
      `/cart/reorder-if-unchanged/${ORDER}`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(reorderBody) }),
    );
  });

  it.each([
    [
      Response.json({ error: "CART_CHANGED", message: "Your cart changed." }, { status: 409 }),
      409,
      "CART_CHANGED",
    ],
    [
      Response.json({ error: "ORDER_NOT_FOUND", message: "Not found" }, { status: 404 }),
      404,
      "ORDER_NOT_FOUND",
    ],
    [Response.json({ error: "Bad Request" }, { status: 400 }), 400, "REORDER_FAILED"],
    [new Response(null, { status: 403 }), 403, "REORDER_FAILED"],
    [new Response(null, { status: 404 }), 404, "FEATURE_NOT_AVAILABLE"],
    [new Response(null, { status: 502 }), 503, "REORDER_FAILED"],
    [
      Response.json({ ...cart, items: [{ ...cartLine, quantity: 0 }] }),
      502,
      "INVALID_CART_RESPONSE",
    ],
  ])("maps an upstream %#", async (answer, status, code) => {
    upstream.mockResolvedValue(answer);
    const response = await reorder(ORDER);
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });
});

describe("Your usual browser calls", () => {
  const basket = { ...candidate, previousOrderTotal: "248.50" } as unknown as RepeatOrderCandidate;
  function answer(routes: Record<string, () => Response>) {
    const fetch = vi.fn(async (url: string) =>
      (routes[url.split("?")[0]] ?? (() => new Response(null, { status: 500 })))(),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("lists the baskets, and none while the backend has no repeat orders", async () => {
    const fetch = answer({ "/api/orders/repeat-candidates": () => Response.json(page) });
    expect((await listRepeatOrders()).map((item) => item.orderId)).toEqual([ORDER]);
    expect(fetch.mock.calls[0][0]).toBe("/api/orders/repeat-candidates?limit=20");
    answer({
      "/api/orders/repeat-candidates": () =>
        Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }),
    });
    expect(await listRepeatOrders()).toEqual([]);
    answer({ "/api/orders/repeat-candidates": () => new Response(null, { status: 403 }) });
    await expect(listRepeatOrders()).rejects.toThrow();
  });

  it("checks the menu, then fills the empty cart with the basket and reloads the cart", async () => {
    menu.mockResolvedValue([{ id: DISH }]);
    const fetch = answer({
      "/api/cart": () => Response.json({ ...cart, items: [] }),
      [`/api/cart/reorder-if-unchanged/${ORDER}`]: () => Response.json(cart),
    });
    expect(await orderLikeLastTime(basket)).toEqual({ added: true });
    expect(menu).toHaveBeenCalledWith(KITCHEN, { remember: false });
    expect(fetch.mock.calls[1]).toEqual([
      `/api/cart/reorder-if-unchanged/${ORDER}`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(reorderBody) }),
    ]);
    expect(loadCart).toHaveBeenCalledTimes(1);
  });

  it("never replaces a cart that holds dishes, and stops at dishes no longer on the menu", async () => {
    menu.mockResolvedValue([{ id: DISH }]);
    const fetch = answer({
      "/api/cart": () =>
        Response.json({ ...cart, items: [{ ...cartLine, kitchenName: "Ammi's" }] }),
    });
    expect(await orderLikeLastTime(basket)).toEqual({
      added: false,
      recovery: "cart",
      message:
        "Your cart already has dishes from Ammi's. Check out or empty your cart first, then order like last time.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    menu.mockResolvedValue([]);
    expect(await orderLikeLastTime(basket)).toMatchObject({ added: false, recovery: "menu" });
    menu.mockRejectedValue(new Error("offline"));
    expect(await orderLikeLastTime(basket)).toMatchObject({ added: false, recovery: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [() => Response.json({ code: "CART_CHANGED" }, { status: 409 }), "cart", /cart changed/],
    [
      () => Response.json({ code: "ORDER_NOT_FOUND" }, { status: 404 }),
      "menu",
      /cannot be rebuilt/,
    ],
    [() => new Response(null, { status: 403 }), "cart", /could not be confirmed/],
    [
      () => Response.json({ code: "INVALID_CART_RESPONSE" }, { status: 502 }),
      "cart",
      /could not be confirmed/,
    ],
  ])(
    "tells the customer where to go when the rebuild fails %#",
    async (failure, recovery, message) => {
      menu.mockResolvedValue([{ id: DISH }]);
      answer({
        "/api/cart": () => Response.json({ ...cart, items: [] }),
        [`/api/cart/reorder-if-unchanged/${ORDER}`]: failure,
      });
      const outcome = await orderLikeLastTime(basket);
      expect(outcome).toMatchObject({ added: false, recovery });
      expect(outcome.added ? "" : outcome.message).toMatch(message);
      expect(loadCart).not.toHaveBeenCalled();
    },
  );
});
