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

  it("passes on the order service's short reason for a refused rebuild, and nothing else", async () => {
    const answer = (message: string, status = 409) =>
      upstream.mockResolvedValueOnce(
        Response.json({ error: "MENU_ITEM_UNAVAILABLE", message }, { status }),
      );
    answer(" This dish is no longer on the menu. ");
    expect(await (await reorder(ORDER)).json()).toEqual({
      code: "MENU_ITEM_UNAVAILABLE",
      message: "This dish is no longer on the menu.",
    });
    answer("x".repeat(181));
    expect(await (await reorder(ORDER)).json()).toEqual({ code: "MENU_ITEM_UNAVAILABLE" });
    answer("Internal detail", 500);
    const failed = await reorder(ORDER);
    expect(failed.status).toBe(503);
    expect(await failed.json()).not.toHaveProperty("message");
  });
});

describe("Your usual browser calls", () => {
  // All a rebuild needs, as My Orders and the order page send it.
  const basket = { orderId: ORDER, kitchenId: KITCHEN, items: [{ menuItemId: DISH }] };
  function answer(routes: Record<string, () => Response>) {
    const fetch = vi.fn(async (url: string) =>
      (routes[url.split("?")[0]] ?? (() => new Response(null, { status: 500 })))(),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("lists a page of baskets, and none once signed out or while the backend has no repeat orders", async () => {
    const fetch = answer({
      "/api/orders/repeat-candidates": () =>
        Response.json({ ...page, nextCursor: "next-1", hasMore: true }),
    });
    expect(await listRepeatOrders()).toMatchObject({
      items: [{ orderId: ORDER }],
      nextCursor: "next-1",
    });
    expect(fetch.mock.calls[0][0]).toBe("/api/orders/repeat-candidates?limit=20");
    await listRepeatOrders("next-1");
    expect(fetch.mock.calls[1][0]).toBe("/api/orders/repeat-candidates?limit=20&cursor=next-1");
    const none = { items: [], nextCursor: null, hasMore: false };
    answer({
      "/api/orders/repeat-candidates": () =>
        Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }),
    });
    expect(await listRepeatOrders()).toEqual(none);
    // The sign-in ended and could not be renewed.
    answer({
      "/api/orders/repeat-candidates": () =>
        Response.json({ code: "SESSION_EXPIRED" }, { status: 401 }),
      "/api/auth/refresh": () => new Response(null, { status: 401 }),
    });
    expect(await listRepeatOrders()).toEqual(none);
    answer({ "/api/orders/repeat-candidates": () => new Response(null, { status: 403 }) });
    await expect(listRepeatOrders()).rejects.toThrow();
  });

  it("checks the menu, then fills the empty cart with the basket without asking and reloads the cart", async () => {
    menu.mockResolvedValue([{ id: DISH }]);
    const confirm = vi.fn(async () => true);
    const fetch = answer({
      "/api/cart": () => Response.json({ ...cart, items: [] }),
      [`/api/cart/reorder-if-unchanged/${ORDER}`]: () => Response.json(cart),
    });
    expect(await orderLikeLastTime(basket, confirm)).toEqual({ added: true });
    expect(menu).toHaveBeenCalledWith(KITCHEN, { remember: false });
    expect(confirm).not.toHaveBeenCalled();
    expect(fetch.mock.calls[1]).toEqual([
      `/api/cart/reorder-if-unchanged/${ORDER}`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(reorderBody) }),
    ]);
    expect(loadCart).toHaveBeenCalledTimes(1);
  });

  it("replaces a cart that holds dishes only once the customer agrees, sending the cart they saw", async () => {
    menu.mockResolvedValue([{ id: DISH }]);
    const fetch = answer({
      "/api/cart": () => Response.json(cart),
      [`/api/cart/reorder-if-unchanged/${ORDER}`]: () => Response.json(cart),
    });
    expect(await orderLikeLastTime(basket, async () => false)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);

    expect(await orderLikeLastTime(basket, async () => true)).toEqual({ added: true });
    expect(fetch.mock.calls[2]).toEqual([
      `/api/cart/reorder-if-unchanged/${ORDER}`,
      expect.objectContaining({
        body: JSON.stringify({
          expectedCart: {
            cartId: CART,
            items: [{ id: cartLine.id, quantity: 2, updatedAt: cartLine.updatedAt }],
          },
          expectedKitchenId: KITCHEN,
        }),
      }),
    ]);
  });

  it("stops at dishes no longer on the menu, a menu that didn't load and a cart it can't read", async () => {
    const confirm = vi.fn(async () => true);
    const fetch = answer({ "/api/cart": () => new Response(null, { status: 503 }) });
    menu.mockResolvedValue([]);
    expect(await orderLikeLastTime(basket, confirm)).toMatchObject({
      added: false,
      recovery: "menu",
    });
    menu.mockRejectedValue(new Error("offline"));
    expect(await orderLikeLastTime(basket, confirm)).toMatchObject({
      added: false,
      recovery: null,
    });
    expect(fetch).not.toHaveBeenCalled();
    menu.mockResolvedValue([{ id: DISH }]);
    expect(await orderLikeLastTime(basket, confirm)).toEqual({
      added: false,
      recovery: "menu",
      message: "Craves could not verify your current cart. Refresh it before trying again.",
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    [
      () => Response.json({ code: "CART_CHANGED" }, { status: 409 }),
      "menu",
      /^Your cart changed while you were reviewing it\. Start again to review the latest cart\.$/,
    ],
    [
      () =>
        Response.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, { status: 404 }),
      "menu",
      /^Order not found\.$/,
    ],
    [
      () => Response.json({ code: "REORDER_FAILED" }, { status: 422 }),
      "menu",
      /^That information changed\. Refresh and try again\.$/,
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
      const outcome = await orderLikeLastTime(basket, async () => true);
      expect(outcome).toMatchObject({ added: false, recovery });
      expect(outcome?.added === false ? outcome.message : "").toMatch(message);
      expect(loadCart).not.toHaveBeenCalled();
    },
  );
});
