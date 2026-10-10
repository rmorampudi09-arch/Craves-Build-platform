// Optimistic cart: taps render at once, writes are coalesced and ordered, the server reply wins.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Line = {
  id: string; menuItemId: string; kitchenId: string; itemName: string; kitchenName: string;
  unitPrice: number; currency: string; quantity: number; lineTotal: number; createdAt: string; updatedAt: string;
};

const ids = {
  cart: "11111111-1111-4111-8111-111111111111",
  kitchenA: "22222222-2222-4222-8222-222222222222",
  kitchenB: "33333333-3333-4333-8333-333333333333",
  dosa: "44444444-4444-4444-8444-444444444444",
  idli: "55555555-5555-4555-8555-555555555555",
  cake: "66666666-6666-4666-8666-666666666666",
  lineDosa: "77777777-7777-4777-8777-777777777777",
};

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  replace: vi.fn(async () => true),
}));
vi.mock("@/services/auth/sessionFetch", () => ({ sessionFetch: mocks.fetch }));
vi.mock("@/lib/cart-kitchen-replacement", () => ({ requestCartKitchenReplacement: mocks.replace }));
vi.mock("@/services/api/dishes", () => ({
  getDish: () => undefined,
  loadDish: async () => { throw new Error("offline"); },
}));

let server: Line[] = [];
let calls: string[] = [];
let gate: Promise<void> | null = null;
let failNext: string | null = null;
let lineSeq = 0;

function line(menuItemId: string, kitchenId: string, quantity: number, price = 100, id?: string): Line {
  return {
    id: id ?? `88888888-8888-4888-8888-${String(++lineSeq).padStart(12, "0")}`,
    menuItemId, kitchenId, itemName: `Dish ${menuItemId.slice(0, 4)}`, kitchenName: kitchenId === ids.kitchenA ? "Amma" : "Bake",
    unitPrice: price, currency: "INR", quantity, lineTotal: price * quantity, createdAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-10T00:00:00Z",
  };
}
const prices: Record<string, number> = { [ids.idli]: 60, [ids.cake]: 300 };
/** Lets pending promise callbacks run without firing any timers. */
async function flushMicrotasks() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}
const body = () => ({ id: ids.cart, currency: "INR", items: server, foodSubtotal: server.reduce((t, l) => t + l.lineTotal, 0) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  server = [line(ids.dosa, ids.kitchenA, 1, 120, ids.lineDosa)];
  calls = [];
  gate = null;
  failNext = null;
  mocks.fetch.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    if (gate) await gate;
    if (failNext === method) {
      failNext = null;
      return { ok: false, json: async () => ({ message: "The cart service is temporarily unavailable. Please try again." }) };
    }
    const payload = init?.body ? JSON.parse(String(init.body)) : {};
    const itemId = path.split("/").pop();
    // Like Order Service: a line that is gone (an order used it, another device removed it) is a 404.
    if ((method === "PUT" || (method === "DELETE" && path !== "/api/cart")) && !server.some((l) => l.id === itemId))
      return { ok: false, status: 404, json: async () => ({ message: "Cart item was not found." }) };
    if (method === "PUT") server = server.map((l) => (l.id === itemId ? { ...l, quantity: payload.quantity, lineTotal: l.unitPrice * payload.quantity } : l));
    if (method === "DELETE") server = path === "/api/cart" ? [] : server.filter((l) => l.id !== itemId);
    if (method === "POST" && path === "/api/cart/items") {
      const kitchen = payload.menuItemId === ids.cake ? ids.kitchenB : ids.kitchenA;
      server = [...server, line(payload.menuItemId, kitchen, payload.quantity, prices[payload.menuItemId])];
    }
    return { ok: true, json: async () => body() };
  });
});
afterEach(() => vi.useRealTimers());

async function loadedCart() {
  const cart = await import("@/services/api/cravesCart");
  await cart.loadCart();
  calls = [];
  return cart;
}

describe("optimistic cart", () => {
  it("shows each tap at once and sends one write with the final quantity", async () => {
    const cart = await loadedCart();
    void cart.setQty(ids.lineDosa, 2);
    void cart.setQty(ids.lineDosa, 3);
    const settled = cart.setQty(ids.lineDosa, 4);
    expect(cart.cartCount()).toBe(4);
    expect(cart.getCart()[0]).toMatchObject({ qty: 4, lineTotal: 480 });
    expect(cart.cartTotal()).toBe(480);
    expect(calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(250);
    await settled;
    expect(calls).toEqual([`PUT /api/cart/items/${ids.lineDosa}`]);
    expect(cart.getCart()[0]).toMatchObject({ qty: 4, lineTotal: 480 });
  });

  it("keeps a newer tap over a stale reply and writes it next", async () => {
    const cart = await loadedCart();
    let open!: () => void;
    gate = new Promise((resolve) => { open = resolve; });
    void cart.setQty(ids.lineDosa, 2);
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toHaveLength(1);
    const settled = cart.setQty(ids.lineDosa, 5);
    gate = null;
    open();
    await vi.advanceTimersByTimeAsync(0);
    expect(cart.cartCount()).toBe(5);
    await vi.advanceTimersByTimeAsync(250);
    await settled;
    expect(calls).toEqual([`PUT /api/cart/items/${ids.lineDosa}`, `PUT /api/cart/items/${ids.lineDosa}`]);
    expect(server[0].quantity).toBe(5);
    expect(cart.cartCount()).toBe(5);
  });

  it("restores the confirmed cart and reports the server message when a write fails", async () => {
    const cart = await loadedCart();
    failNext = "PUT";
    const settled = cart.setQty(ids.lineDosa, 3).then(() => null, (error: Error) => error);
    expect(cart.cartCount()).toBe(3);
    await vi.advanceTimersByTimeAsync(250);
    expect((await settled)?.message).toMatch("temporarily unavailable");
    expect(cart.cartCount()).toBe(1);
    expect(cart.cartTotal()).toBe(120);
  });

  it("adds a new dish at once and folds quick taps on it into the follow-up write", async () => {
    const cart = await loadedCart();
    const added = cart.addToCart({ id: ids.idli, name: "Idli", chef: "Amma", price: 60, img: "/idli.jpg", kitchenId: ids.kitchenA });
    await flushMicrotasks();
    expect(calls).toEqual([]);
    const draft = cart.getCart().find((item) => item.menuItemId === ids.idli);
    expect(draft).toMatchObject({ qty: 1, lineTotal: 60 });
    void cart.setQty(draft!.id, 2);
    await vi.advanceTimersByTimeAsync(250);
    await added;
    expect(calls).toEqual(["POST /api/cart/items"]);
    expect(server.find((l) => l.menuItemId === ids.idli)?.quantity).toBe(2);
    expect(cart.cartCount()).toBe(3);
  });

  it("removes at once and brings the line back if Craves refuses", async () => {
    const cart = await loadedCart();
    failNext = "DELETE";
    const removed = cart.removeFromCart(ids.lineDosa).then(() => null, (error: Error) => error);
    expect(cart.getCart()).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await removed).toBeInstanceOf(Error);
    expect(cart.getCart()).toHaveLength(1);
  });

  it("replaces another kitchen's cart with a single update (never an empty flash)", async () => {
    const cart = await loadedCart();
    const counts: number[] = [];
    cart.subscribeCart(() => counts.push(cart.cartCount()));
    await cart.addToCart({ id: ids.cake, name: "Cake", chef: "Bake", price: 300, img: "", kitchenId: ids.kitchenB }, 1);
    expect(calls).toEqual(["DELETE /api/cart", "POST /api/cart/items"]);
    expect(counts.length).toBeGreaterThan(0);
    expect(counts).not.toContain(0);
    expect(cart.getCart().map((item) => item.menuItemId)).toEqual([ids.cake]);
  });

  it("re-applies an add to the cart Craves holds now when an order already used the one on screen", async () => {
    server = [line(ids.dosa, ids.kitchenA, 2, 120, ids.lineDosa)];
    const cart = await loadedCart();
    server = []; // the paid order consumed the server cart; this page still shows 2
    const added = cart.addToCart({ id: ids.dosa, name: "Dosa", chef: "Amma", price: 120, img: "", kitchenId: ids.kitchenA });
    await vi.runAllTimersAsync();
    await added;
    expect(calls).toEqual(["PUT /api/cart/items/" + ids.lineDosa, "GET /api/cart", "POST /api/cart/items"]);
    // The customer's +1 lands on the real cart, not on top of the stale 2.
    expect(server.map((l) => [l.menuItemId, l.quantity])).toEqual([[ids.dosa, 1]]);
    expect(cart.getCart().map((l) => l.qty)).toEqual([1]);
  });

  it("keeps a line removed elsewhere removed when a minus was based on it", async () => {
    server = [line(ids.dosa, ids.kitchenA, 2, 120, ids.lineDosa)];
    const cart = await loadedCart();
    server = [];
    const lowered = cart.setQty(ids.lineDosa, 1);
    await vi.runAllTimersAsync();
    await lowered;
    expect(calls).toEqual(["PUT /api/cart/items/" + ids.lineDosa, "GET /api/cart"]);
    expect(server).toEqual([]);
    expect(cart.getCart()).toEqual([]);
  });

  it("validates only after waiting quantity writes have landed", async () => {
    const cart = await loadedCart();
    void cart.setQty(ids.lineDosa, 2);
    const validated = cart.validateCart();
    await vi.advanceTimersByTimeAsync(0);
    await validated;
    expect(calls).toEqual([`PUT /api/cart/items/${ids.lineDosa}`, "POST /api/cart/validate"]);
  });
});
