// @vitest-environment jsdom
// Synthetic owned orders; no backend is contacted.
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const navigate = vi.hoisted(() => vi.fn());
const menu = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) =>
    createElement("a", { href: to, ...rest }, children),
}));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  loadSession: async () => ({ id: "fixture-customer" }),
}));
vi.mock("@/features/cart/api/cravesCart", () => ({
  addToCart: vi.fn(),
  loadCart: vi.fn(async () => []),
  CartKeptError: class extends Error {},
}));
vi.mock("@/features/dish/api/dishes", () => ({ loadKitchenMenu: menu }));

import OrdersPage from "../screens/OrderHistory";

const KITCHEN = "4a000000-0000-4000-8000-000000000001";
const DELIVERED = "0bde0000-0000-4000-8000-000000000101";
const DISH = "0bde0000-0000-4000-8000-000000000201";
const CART = "0bde0000-0000-4000-8000-000000000401";
// Each step waits on the one before (session, orders, baskets, menu, cart): give a busy test machine time.
const WAIT = { timeout: 5000 };
const PHOTO = "https://craves.in/media/public/chef-avatars/chef-avatar-07.jpg";

function order(id: string, status: string) {
  const at = new Date(Date.now() - 3 * 86_400_000).toISOString();
  return {
    id,
    checkoutId: id,
    kitchenId: KITCHEN,
    kitchenName: "Relangi",
    status,
    currency: "INR",
    foodSubtotal: 240,
    platformFee: 0,
    taxAmount: 0,
    deliveryFee: 0,
    grandTotal: 240,
    chefResponseNote: null,
    prepTimeMinutes: null,
    deliveryAddress: null,
    createdAt: at,
    updatedAt: at,
    items: [
      {
        id: `${id.slice(0, -3)}301`,
        menuItemId: DISH,
        itemName: "Veg thali",
        category: "Meals",
        foodType: "VEG",
        unitPrice: 120,
        quantity: 2,
        lineTotal: 240,
      },
    ],
  };
}
const candidate = {
  orderId: DELIVERED,
  kitchenId: KITCHEN,
  kitchenName: "Relangi",
  lastOrderedAt: "2026-10-10T07:12:00Z",
  completedOrdersFromKitchen: 3,
  items: [{ menuItemId: DISH, itemName: "Veg thali", quantity: 2 }],
  previousOrderTotal: "240",
  previousOrderCurrency: "INR",
  orderLikeLastTimeAvailable: true,
  preferenceRecallSupported: true,
  rememberedPreferenceCount: 0,
  currentValidationNotice: "Prices are checked again when the cart is rebuilt.",
};
const kitchen = {
  id: KITCHEN,
  kitchenName: "Relangi",
  displayName: null,
  description: null,
  areaName: null,
  city: "Hyderabad",
  state: "Telangana",
  status: "ACTIVE",
  createdAt: null,
  chefPhotoUrl: PHOTO,
  kitchenPhotoUrls: [],
};
const emptyCart = {
  id: CART,
  currency: "INR",
  items: [],
  totals: { foodSubtotal: 0, currency: "INR" },
};
const line = {
  id: "0bde0000-0000-4000-8000-000000000302",
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

const FAVOURITE = "4a000000-0000-4000-8000-000000000002";
const OTHER_ORDER = "0bde0000-0000-4000-8000-000000000103";
const favouriteBasket = {
  ...candidate,
  orderId: OTHER_ORDER,
  kitchenId: FAVOURITE,
  kitchenName: "Ammi's",
  completedOrdersFromKitchen: 1,
};

function serve(
  orders: unknown[],
  {
    cart = emptyCart as unknown,
    pages = [{ items: [candidate], nextCursor: null as string | null, hasMore: false }],
    favourites = [] as string[],
  } = {},
) {
  const fetch = vi.fn(async (url: string) => {
    const path = url.split("?")[0];
    if (path === "/api/orders") return Response.json(orders);
    if (path === "/api/orders/repeat-candidates")
      return Response.json(pages[url.includes("cursor=") ? 1 : 0]);
    if (path === "/api/customer/favorite-kitchens")
      return Response.json({
        items: favourites.map((kitchenId) => ({ kitchenId, createdAt: "2026-10-01T00:00:00Z" })),
        nextCursor: null,
      });
    if (path === `/api/catalog/kitchens/${KITCHEN}`) return Response.json(kitchen);
    if (path === "/api/cart") return Response.json(cart);
    if (path === `/api/cart/reorder-if-unchanged/${DELIVERED}`)
      return Response.json({
        ...emptyCart,
        items: [line],
        totals: { foodSubtotal: 240, currency: "INR" },
      });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  navigate.mockReset();
  menu.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows the chef's face on each order and refills the cart from Your usual in one tap", async () => {
  serve([order(DELIVERED, "DELIVERED")]);
  menu.mockResolvedValue([{ id: DISH }]);
  render(createElement(OrdersPage));

  const usual = await screen.findByRole("region", { name: "Your usual" }, WAIT);
  expect(within(usual).getByText("2× Veg thali")).toBeTruthy();
  expect(within(usual).getByText("Ordered from this kitchen 3 times")).toBeTruthy();
  expect(within(usual).getByText("Previous total ₹240")).toBeTruthy();
  const past = screen.getByRole("region", { name: "Past orders" });
  await vi.waitFor(() => expect(past.querySelector("img")?.getAttribute("src")).toBe(PHOTO), WAIT);

  fireEvent.click(within(usual).getByRole("button", { name: "Order like last time" }));
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/cart" }), WAIT);
});

it("asks before replacing dishes already in the cart, and keeps them when told to", async () => {
  const fetch = serve([order(DELIVERED, "DELIVERED")], {
    cart: { ...emptyCart, items: [line], totals: { foodSubtotal: 240, currency: "INR" } },
  });
  const rebuilt = () =>
    fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/cart/reorder-if-unchanged"));
  menu.mockResolvedValue([{ id: DISH }]);
  render(createElement(OrdersPage));

  const button = await screen.findByRole("button", { name: "Order like last time" }, WAIT);
  fireEvent.click(button);
  const ask = await screen.findByRole("alertdialog", { name: "Replace current cart?" }, WAIT);
  fireEvent.click(within(ask).getByRole("button", { name: "Keep cart" }));
  await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull(), WAIT);
  await vi.waitFor(() => expect(button.hasAttribute("disabled")).toBe(false), WAIT);
  expect(rebuilt()).toHaveLength(0);

  fireEvent.click(button);
  fireEvent.click(await screen.findByRole("button", { name: "Verify & replace" }, WAIT));
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/cart" }), WAIT);
  expect(rebuilt()[0]).toEqual([
    `/api/cart/reorder-if-unchanged/${DELIVERED}`,
    expect.objectContaining({
      body: JSON.stringify({
        expectedCart: {
          cartId: CART,
          items: [{ id: line.id, quantity: 2, updatedAt: line.updatedAt }],
        },
        expectedKitchenId: KITCHEN,
      }),
    }),
  ]);
});

it("puts favourite kitchens first and ranks more baskets on request", async () => {
  serve([order(DELIVERED, "DELIVERED")], {
    pages: [
      { items: [candidate], nextCursor: "next-1", hasMore: true },
      { items: [favouriteBasket], nextCursor: null, hasMore: false },
    ],
    favourites: [FAVOURITE],
  });
  render(createElement(OrdersPage));

  const usual = await screen.findByRole("region", { name: "Your usual" }, WAIT);
  expect(within(usual).queryByText("Favorite kitchen")).toBeNull();
  fireEvent.click(within(usual).getByRole("button", { name: "Show more familiar orders" }));
  await vi.waitFor(
    () =>
      expect(
        within(usual)
          .getAllByRole("heading", { level: 3 })
          .map((h) => h.textContent),
      ).toEqual(["Ammi's", "Relangi"]),
    WAIT,
  );
  expect(within(usual).getByText("Favorite kitchen")).toBeTruthy();
  expect(within(usual).queryByRole("button", { name: "Show more familiar orders" })).toBeNull();
});

it("asks for repeat baskets only once something was delivered", async () => {
  const fetch = serve([order("0bde0000-0000-4000-8000-000000000102", "PREPARING")]);
  render(createElement(OrdersPage));
  await screen.findByRole("region", { name: "In progress" }, WAIT);
  expect(screen.queryByRole("region", { name: "Your usual" })).toBeNull();
  expect(
    fetch.mock.calls.some(([url]) => String(url).startsWith("/api/orders/repeat-candidates")),
  ).toBe(false);
});
