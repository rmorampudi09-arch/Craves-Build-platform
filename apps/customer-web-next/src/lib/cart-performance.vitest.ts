import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerCart } from "./cart-contract";
import type { CustomerOrder } from "./order-contract";

const mocks = vi.hoisted(() => ({ request: vi.fn(), dish: vi.fn(), detail: vi.fn(), replacement: vi.fn() }));
vi.mock("../services/auth/sessionFetch", () => ({ sessionFetch: mocks.request }));
vi.mock("../services/api/dishes", () => ({ getDish: mocks.dish, loadDish: mocks.detail }));
vi.mock("./cart-kitchen-replacement", () => ({ requestCartKitchenReplacement: mocks.replacement }));

const identity = {
  id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000",
  displayName: "First owner", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER"],
};
const itemId = "22222222-2222-4222-8222-222222222222";
const menuItemId = "33333333-3333-4333-8333-333333333333";
const kitchenId = "44444444-4444-4444-8444-444444444444";
function fixture(quantity = 1, name = "First owner's food"): CustomerCart {
  return {
    id: "55555555-5555-4555-8555-555555555555", currency: "INR", foodSubtotal: quantity * 100,
    items: quantity ? [{
      id: itemId, menuItemId, kitchenId, itemName: name, kitchenName: "Fixture kitchen",
      unitPrice: 100, currency: "INR", quantity, lineTotal: quantity * 100,
      createdAt: "2026-09-14T10:00:00Z", updatedAt: "2026-09-14T10:00:00Z",
    }] : [],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let auth: typeof import("../services/auth/cravesAuth");
let cart: typeof import("../services/api/cravesCart");
beforeEach(async () => {
  vi.resetModules();
  mocks.request.mockReset(); mocks.dish.mockReset(); mocks.detail.mockReset(); mocks.replacement.mockReset();
  auth = await import("../services/auth/cravesAuth");
  auth.setSessionIdentity(identity);
  cart = await import("../services/api/cravesCart");
});
afterEach(() => vi.unstubAllGlobals());

describe("cart read request sharing", () => {
  it("shares simultaneous reads but refreshes again after the request settles", async () => {
    const response = deferred<Response>();
    mocks.request.mockReturnValueOnce(response.promise).mockResolvedValueOnce(Response.json(fixture(2)));
    const first = cart.loadCart();
    const second = cart.loadCart();
    const third = cart.loadCart();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    response.resolve(Response.json(fixture()));
    expect((await Promise.all([first, second, third])).map(items => items[0]?.qty)).toEqual([1, 1, 1]);
    expect((await cart.loadCart())[0]?.qty).toBe(2);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request).toHaveBeenCalledWith("/api/cart", expect.objectContaining({ cache: "no-store" }));
  });

  it("releases a failed shared read so the next caller can retry", async () => {
    const response = deferred<Response>();
    mocks.request.mockReturnValueOnce(response.promise).mockResolvedValueOnce(Response.json(fixture()));
    const first = cart.loadCart();
    const second = cart.loadCart();
    const results = Promise.allSettled([first, second]);
    response.reject(new Error("Network fixture"));
    expect((await results).map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect((await cart.loadCart())[0]?.qty).toBe(1);
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  for (const outcome of ["success", "unavailable", "network"] as const) {
    it(`does not let an old GET ${outcome} overwrite or reset a newer quantity receipt`, async () => {
      const response = deferred<Response>();
      mocks.request.mockReturnValueOnce(response.promise).mockResolvedValueOnce(Response.json(fixture(3)));
      const reading = cart.loadCart();
      await cart.setQty(itemId, 3);
      if (outcome === "network") response.reject(new Error("Late network fixture"));
      else response.resolve(outcome === "success" ? Response.json(fixture()) : Response.json({}, { status: 503 }));
      expect((await reading)[0]?.qty).toBe(3);
      expect(cart.cartCount()).toBe(3);
      expect(cart.cartTotal()).toBe(300);
    });
  }

  it("invalidates a GET started while a mutation was pending when the write receipt arrives", async () => {
    const mutation = deferred<Response>();
    const reading = deferred<Response>();
    mocks.request.mockReturnValueOnce(mutation.promise).mockReturnValueOnce(reading.promise);
    const writing = cart.setQty(itemId, 4);
    await Promise.resolve();
    expect(mocks.request).toHaveBeenCalledWith(`/api/cart/items/${itemId}`, expect.objectContaining({ method: "PUT" }));
    const loading = cart.loadCart();
    mutation.resolve(Response.json(fixture(4)));
    await writing;
    reading.resolve(Response.json(fixture()));
    expect((await loading)[0]?.qty).toBe(4);
    expect(cart.cartCount()).toBe(4);
  });
});

describe("cart mutation ordering", () => {
  const food = { id: menuItemId, name: "Food", chef: "Fixture kitchen", price: 100, img: "", kitchenId };

  it("accepts two concurrent add operations once each without reporting an accepted write as failed", async () => {
    mocks.request.mockResolvedValueOnce(Response.json(fixture(0)));
    await cart.loadCart();
    const firstReceipt = deferred<Response>();
    mocks.request.mockReturnValueOnce(firstReceipt.promise).mockResolvedValueOnce(Response.json(fixture(2)));

    const first = cart.addToCart(food, 1);
    const second = cart.addToCart({ ...food, id: itemId, name: "Second food" }, 1);
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(mocks.request.mock.calls[1][1].method).toBe("POST");
    firstReceipt.resolve(Response.json(fixture()));
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(mocks.request.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
      ["/api/cart", "GET"], ["/api/cart/items", "POST"], ["/api/cart/items", "POST"],
    ]);
    expect(mocks.request.mock.calls.slice(1).map(([, init]) => JSON.parse(init.body).menuItemId)).toEqual([menuItemId, itemId]);
    expect(cart.cartCount()).toBe(2);
  });

  it("runs the next queued add after the preceding add is rejected", async () => {
    mocks.request.mockResolvedValueOnce(Response.json(fixture(0)));
    await cart.loadCart();
    const firstReceipt = deferred<Response>();
    mocks.request.mockReturnValueOnce(firstReceipt.promise).mockResolvedValueOnce(Response.json(fixture()));

    const first = cart.addToCart(food, 1);
    const rejected = expect(first).rejects.toThrow("Fixture add rejected");
    const second = cart.addToCart({ ...food, id: itemId }, 1);
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    firstReceipt.resolve(Response.json({ message: "Fixture add rejected" }, { status: 400 }));
    await rejected;
    await expect(second).resolves.toBeUndefined();
    expect(mocks.request.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(2);
    expect(cart.cartCount()).toBe(1);
  });

  it.each(["new owner", "same owner new login"])("discards queued earlier writes after %s and lets the fresh session write immediately", async (transition) => {
    const firstReceipt = deferred<Response>();
    mocks.request.mockReturnValueOnce(firstReceipt.promise).mockResolvedValueOnce(Response.json(fixture(2)));
    const first = cart.setQty(itemId, 4);
    const firstRejected = expect(first).rejects.toThrow("cart changed");
    await Promise.resolve();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    const queued = cart.setQty(itemId, 5);
    const queuedRejected = expect(queued).rejects.toThrow("cart changed");

    auth.setSessionIdentity({ ...identity, id: transition === "new owner" ? kitchenId : identity.id });
    await cart.setQty(itemId, 2);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(cart.cartCount()).toBe(2);
    firstReceipt.resolve(Response.json(fixture(4)));
    await Promise.all([firstRejected, queuedRejected]);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(cart.cartCount()).toBe(2);
  });
});

describe("cart session ownership", () => {
  it("clears private cart rows on an account switch and keeps the new shared read intact", async () => {
    const oldRead = deferred<Response>();
    const newRead = deferred<Response>();
    mocks.request.mockResolvedValueOnce(Response.json(fixture()))
      .mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
    await cart.loadCart();
    const oldLoading = cart.loadCart();
    auth.setSessionIdentity({ ...identity, id: "66666666-6666-4666-8666-666666666666" });
    expect(cart.getCart()).toEqual([]);
    expect(cart.cartTotal()).toBe(0);
    const first = cart.loadCart();
    const second = cart.loadCart();
    oldRead.resolve(Response.json(fixture(5)));
    expect(await oldLoading).toEqual([]);
    const third = cart.loadCart();
    expect(mocks.request).toHaveBeenCalledTimes(3);
    newRead.resolve(Response.json(fixture(2, "Second owner's food")));
    await Promise.all([first, second, third]);
    expect(cart.getCart()[0]?.name).toBe("Second owner's food");
  });

  it("ignores a mutation receipt from an earlier same-owner sign-in generation", async () => {
    const mutation = deferred<Response>();
    mocks.request.mockReturnValueOnce(mutation.promise).mockResolvedValueOnce(Response.json(fixture(2)));
    const writing = cart.setQty(itemId, 5);
    const rejected = expect(writing).rejects.toThrow("cart changed");
    await Promise.resolve();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    auth.setSessionIdentity(identity);
    await cart.loadCart();
    mutation.resolve(Response.json(fixture(5)));
    await rejected;
    expect(cart.cartCount()).toBe(2);
  });

  it("does not start an old add operation's mutation after an account switch during dish lookup", async () => {
    const detail = deferred<unknown>();
    mocks.request.mockResolvedValue(Response.json(fixture()));
    await cart.loadCart();
    mocks.detail.mockReturnValueOnce(detail.promise);
    const adding = cart.addToCart({ id: menuItemId, name: "Food", chef: "Fixture kitchen", price: 100, img: "" });
    const rejected = expect(adding).rejects.toThrow("cart changed");
    auth.setSessionIdentity({ ...identity, id: "66666666-6666-4666-8666-666666666666" });
    detail.resolve({ kitchenId, chef: "Fixture kitchen" });
    await rejected;
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(cart.getCart()).toEqual([]);
  });

  it("does not restore earlier cart rows after an unconfirmed logout restores the same identity", async () => {
    const reading = deferred<Response>();
    mocks.request.mockResolvedValueOnce(Response.json(fixture())).mockReturnValueOnce(reading.promise);
    await cart.loadCart();
    const loading = cart.loadCart();
    vi.stubGlobal("fetch", async () => Response.json({ signedOut: false }, { status: 503 }));
    await expect(auth.clearSession()).rejects.toThrow("still signed in");
    expect(auth.isSessionReady()).toBe(true);
    reading.resolve(Response.json(fixture(4)));
    expect(await loading).toEqual([]);
    expect(cart.getCart()).toEqual([]);
  });

  it("uses backend validation and restores checkout items through server mutations", async () => {
    const orders = [{ items: [{ menuItemId, quantity: 2 }] }] as unknown as CustomerOrder[];
    mocks.request.mockResolvedValueOnce(Response.json(fixture()))
      .mockResolvedValueOnce(Response.json(fixture(0)))
      .mockResolvedValueOnce(Response.json(fixture(2)))
      .mockResolvedValueOnce(Response.json(fixture(2)))
      .mockResolvedValueOnce(Response.json(fixture(3)));
    expect(await cart.ensureCheckoutCart(orders)).toBe(true);
    expect(mocks.request.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
      ["/api/cart", "GET"], ["/api/cart", "DELETE"], ["/api/cart/items", "POST"], ["/api/cart", "GET"],
    ]);
    expect(JSON.parse(mocks.request.mock.calls[2][1].body)).toEqual({ menuItemId, quantity: 2 });
    expect((await cart.validateCart()).foodSubtotal).toBe(300);
    expect(cart.cartCount()).toBe(3);
  });
});
