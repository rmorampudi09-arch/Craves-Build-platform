// @vitest-environment jsdom
// My Orders with synthetic owned orders; no backend, cart or session changes.
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  session: vi.fn(),
  menu: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => createElement("a", { href: to, ...rest }, children),
}));
vi.mock("@/features/auth/api/cravesAuth", () => ({ loadSession: mocks.session }));
vi.mock("@/features/cart/api/cravesCart", () => ({ loadCart: vi.fn(async () => []) }));
vi.mock("@/features/dish/api/dishes", () => ({ loadKitchenMenu: mocks.menu }));

import OrdersPage from "../screens/OrderHistory";

const KITCHEN = "0bde0000-0000-4000-8000-000000000020";
const DISH = "0bde0000-0000-4000-8000-000000000041";
const PHOTO = "https://cdn.craves.in/dishes/thali.jpg";
const ids = { unpaid: "0bde0000-0000-4000-8000-000000000011", cooking: "1bde0000-0000-4000-8000-000000000012", delivered: "2bde0000-0000-4000-8000-000000000013", older: "3bde0000-0000-4000-8000-000000000014" };

function item(n: number, name: string, quantity = 1) {
  return { id: `0bde0000-0000-4000-8000-0000000003${n}0`, menuItemId: n === 1 ? DISH : `0bde0000-0000-4000-8000-0000000004${n}0`, itemName: name, category: "Meals", foodType: "VEG", unitPrice: 100, quantity, lineTotal: 100 * quantity };
}

function order(id: string, kitchenName: string, status: string, minutesAgo: number, items = [item(1, "Veg thali")]) {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    id, checkoutId: id, kitchenId: KITCHEN, kitchenName, status, currency: "INR",
    foodSubtotal: 300, platformFee: 0, taxAmount: 0, deliveryFee: 0, grandTotal: 300, chefResponseNote: null,
    prepTimeMinutes: null, deliveryAddress: null, createdAt: at, updatedAt: at, items,
  };
}

type Answer = unknown | (() => Response);
/** Answers by path and query; anything else is a 404 (the kitchen profile reads, for one). */
function serve(routes: Record<string, Answer>) {
  const fetch = vi.fn(async (url: string) => {
    const answer = routes[url];
    if (answer === undefined) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    return typeof answer === "function" ? (answer as () => Response)() : Response.json(answer);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const PAGE = "/api/orders/page?limit=20";
const UNREAD = { "/api/notifications/in-app/unread-count": { unreadCount: 3 } };

beforeEach(() => {
  mocks.session.mockResolvedValue({ id: "fixture-customer" });
  mocks.menu.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("My Orders", () => {
  it("shows the app's cards: kitchen, time and number, total, dishes, status and the next step", async () => {
    mocks.menu.mockResolvedValue([{ id: DISH, img: PHOTO, imageIsPlaceholder: false }]);
    serve({
      ...UNREAD,
      [PAGE]: { orders: [
        order(ids.cooking, "Lakshmi's Kitchen", "PREPARING", 10),
        order(ids.delivered, "Ammi's Dastarkhwan", "DELIVERED", 60 * 30, [item(1, "Veg thali", 2), item(2, "Roti", 4), item(3, "Dal"), item(4, "Kheer")]),
      ], nextCursor: null, hasMore: false },
    });
    render(createElement(OrdersPage));

    expect(await screen.findByRole("heading", { level: 1, name: "My Orders" })).toBeTruthy();
    expect((await screen.findByRole("link", { name: "Notifications, 3 unread" })).getAttribute("href")).toBe("/notifications");

    const cooking = screen.getByRole("link", { name: "Lakshmi's Kitchen" }).closest("article")!;
    expect(within(cooking).getByRole("link", { name: "Lakshmi's Kitchen" }).getAttribute("href")).toBe(`/orders/${ids.cooking}`);
    expect(cooking.textContent).toMatch(/Today, .* · #1BDE0000/);
    expect(within(cooking).getByText("₹300")).toBeTruthy();
    expect(within(cooking).getByText("Preparing")).toBeTruthy();
    expect(within(cooking).getByRole("link", { name: /Track order/ }).getAttribute("href")).toBe(`/orders/${ids.cooking}/tracking`);
    expect(within(cooking).queryByRole("button", { name: /Reorder/ })).toBeNull();
    await vi.waitFor(() => expect(cooking.querySelector("img")?.getAttribute("src")).toBe(PHOTO));

    const delivered = screen.getByRole("link", { name: "Ammi's Dastarkhwan" }).closest("article")!;
    expect(within(delivered).getByText("Veg thali × 2, Roti × 4, Dal × 1, Kheer × 1")).toBeTruthy();
    expect(within(delivered).getByText("Delivered")).toBeTruthy();
    // Three dish photos at most, then how many more.
    expect(delivered.textContent).toContain("+1");
    expect(within(delivered).getByRole("button", { name: "Reorder from Ammi's Dastarkhwan" })).toBeTruthy();
    expect(within(delivered).queryByRole("link", { name: /Track order/ })).toBeNull();
    // The app removed "Your usual" from My Orders.
    expect(screen.queryByRole("region", { name: "Your usual" })).toBeNull();
  });

  it("files orders under the app's tabs; an unpaid checkout older than 30 minutes is cancelled, not upcoming", async () => {
    serve({ [PAGE]: { orders: [
      order(ids.cooking, "Lakshmi's Kitchen", "PREPARING", 10),
      order(ids.delivered, "Ammi's Dastarkhwan", "DELIVERED", 90),
      order(ids.unpaid, "Relangi Ruchulu", "PAYMENT_PENDING", 120),
    ], nextCursor: null, hasMore: false } });
    render(createElement(OrdersPage));
    await screen.findByRole("link", { name: "Lakshmi's Kitchen" });
    const kitchens = () => screen.queryAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(kitchens()).toEqual(["Lakshmi's Kitchen", "Ammi's Dastarkhwan", "Relangi Ruchulu"]);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Upcoming" }));
    expect(kitchens()).toEqual(["Lakshmi's Kitchen"]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Completed" }));
    expect(kitchens()).toEqual(["Ammi's Dastarkhwan"]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Cancelled" }));
    expect(kitchens()).toEqual(["Relangi Ruchulu"]);
    // Opens the order page that explains it; nothing was paid, so no tracking either.
    expect(screen.getByText("Payment not completed")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Relangi Ruchulu" }).getAttribute("href")).toBe(`/orders/${ids.unpaid}`);
    expect(screen.queryByRole("link", { name: /Track order/ })).toBeNull();
  });

  it("loads older orders 20 at a time", async () => {
    const fetch = serve({
      [PAGE]: { orders: [order(ids.cooking, "Lakshmi's Kitchen", "PREPARING", 10)], nextCursor: "c2", hasMore: true },
      [`${PAGE}&cursor=c2`]: { orders: [order(ids.older, "Older Kitchen", "DELIVERED", 60 * 24 * 40)], nextCursor: null, hasMore: false },
    });
    render(createElement(OrdersPage));
    fireEvent.click(await screen.findByRole("button", { name: "Load older orders" }));
    expect(await screen.findByRole("link", { name: "Older Kitchen" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Lakshmi's Kitchen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load older orders" })).toBeNull();
    expect(fetch.mock.calls.some(([url]) => url === "/api/orders")).toBe(false);
  });

  it("uses the latest list while the paged list isn't live", async () => {
    serve({
      [PAGE]: () => Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }),
      "/api/orders": [order(ids.delivered, "Ammi's Dastarkhwan", "DELIVERED", 90), order(ids.cooking, "Lakshmi's Kitchen", "PREPARING", 10)],
    });
    render(createElement(OrdersPage));
    await screen.findByRole("link", { name: "Lakshmi's Kitchen" });
    // Newest first, and no paging to offer.
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Lakshmi's Kitchen", "Ammi's Dastarkhwan"]);
    expect(screen.queryByRole("button", { name: "Load older orders" })).toBeNull();
  });

  it("invites a first order when there are none", async () => {
    serve({ [PAGE]: { orders: [], nextCursor: null, hasMore: false } });
    render(createElement(OrdersPage));
    expect(await screen.findByRole("heading", { name: "No orders yet" })).toBeTruthy();
    expect(screen.getByTestId("empty-illustration-ordersLamp")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find something to eat" }).getAttribute("href")).toBe("/home");
  });

  it("says when the orders didn't load and tries again, without showing the server's words", async () => {
    let up = false;
    serve({
      [PAGE]: () => (up ? Response.json({ orders: [order(ids.cooking, "Lakshmi's Kitchen", "PREPARING", 10)], nextCursor: null, hasMore: false }) : Response.json({ code: "ORDER_HISTORY_FAILED", message: "upstream exploded" }, { status: 503 })),
      "/api/orders": () => Response.json({ code: "ORDERS_UNAVAILABLE", message: "upstream exploded" }, { status: 503 }),
    });
    render(createElement(OrdersPage));
    expect(await screen.findByRole("heading", { name: "We couldn’t load your orders" })).toBeTruthy();
    expect(screen.getByTestId("empty-illustration-loadError")).toBeTruthy();
    expect(screen.queryByText(/upstream exploded/)).toBeNull();
    up = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Lakshmi's Kitchen" })).toBeTruthy();
  });

  it("keeps a customer whose sign-in couldn't be checked here, with Try again and a way to sign in", async () => {
    mocks.session.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    serve({ [PAGE]: { orders: [order(ids.cooking, "Lakshmi's Kitchen", "PREPARING", 10)], nextCursor: null, hasMore: false } });
    render(createElement(OrdersPage));
    expect(await screen.findByRole("heading", { name: "We couldn’t sign you back in" })).toBeTruthy();
    expect(screen.getByTestId("empty-illustration-session")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to sign in" }).getAttribute("href")).toBe("/sign-in?returnTo=%2Forders");
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Lakshmi's Kitchen" })).toBeTruthy();
  });

  it("sends someone who is signed out to the landing page", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const fetch = serve({});
    render(createElement(OrdersPage));
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(fetch.mock.calls.some(([url]) => String(url).startsWith("/api/orders"))).toBe(false);
  });

});

describe("Reorder, like the app", () => {
  const CART = "0bde0000-0000-4000-8000-000000000051";
  const LINE = { id: "0bde0000-0000-4000-8000-000000000061", quantity: 2, updatedAt: "2026-10-30T08:00:00Z" };
  const REORDER = `/api/cart/reorder-if-unchanged/${ids.delivered}`;
  const NAME = "Reorder from Ammi's Dastarkhwan";
  /** One delivered order, the cart Craves holds now, and how Craves answers the rebuild. */
  function deliveredWith(cartItems: unknown[], rebuilt: Answer = { id: CART, items: [] }) {
    mocks.menu.mockResolvedValue([{ id: DISH, img: PHOTO, imageIsPlaceholder: false }]);
    return serve({
      [PAGE]: { orders: [order(ids.delivered, "Ammi's Dastarkhwan", "DELIVERED", 90)], nextCursor: null, hasMore: false },
      "/api/cart": { id: CART, items: cartItems },
      [REORDER]: rebuilt,
    });
  }
  const sent = (items: unknown[]) => JSON.stringify({ expectedCart: { cartId: CART, items }, expectedKitchenId: KITCHEN });

  it("fills an empty cart with the whole order in one step, then opens the cart", async () => {
    const fetch = deliveredWith([]);
    render(createElement(OrdersPage));
    fireEvent.click(await screen.findByRole("button", { name: NAME }));
    expect(screen.getByRole("button", { name: "Preparing… from Ammi's Dastarkhwan" })).toBeTruthy();
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/cart" }));
    expect(fetch).toHaveBeenCalledWith(REORDER, expect.objectContaining({ method: "POST", body: sent([]) }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks before replacing a cart that holds dishes, and keeps it when the customer says so", async () => {
    const fetch = deliveredWith([LINE]);
    render(createElement(OrdersPage));
    fireEvent.click(await screen.findByRole("button", { name: NAME }));
    const ask = await screen.findByRole("dialog", { name: "Replace current cart?" });
    expect(within(ask).getByText("Reorder will replace your current cart after Craves verifies every dish is still available.")).toBeTruthy();
    fireEvent.click(within(ask).getByRole("button", { name: "Keep cart" }));
    expect(await screen.findByRole("button", { name: NAME })).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => url === REORDER)).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: NAME }));
    fireEvent.click(await screen.findByRole("button", { name: "Replace & reorder" }));
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/cart" }));
    // The cart the customer agreed to replace: Craves refuses if it changed meanwhile.
    expect(fetch).toHaveBeenCalledWith(REORDER, expect.objectContaining({ body: sent([LINE]) }));
  });

  it("shows Craves' reason when the order can't be rebuilt, and stays on My Orders", async () => {
    deliveredWith([], () => Response.json({ code: "MENU_ITEM_UNAVAILABLE", message: "This dish is no longer on the menu." }, { status: 409 }));
    render(createElement(OrdersPage));
    fireEvent.click(await screen.findByRole("button", { name: NAME }));
    const card = screen.getByRole("link", { name: "Ammi's Dastarkhwan" }).closest("article")!;
    expect((await within(card).findByRole("status")).textContent).toBe("This dish is no longer on the menu.");
    expect(within(card).getByRole("button", { name: NAME })).toBeTruthy();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
