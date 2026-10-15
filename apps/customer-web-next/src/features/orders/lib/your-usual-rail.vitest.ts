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

function serve(orders: unknown[], cart: unknown = emptyCart) {
  const fetch = vi.fn(async (url: string) => {
    const path = url.split("?")[0];
    if (path === "/api/orders") return Response.json(orders);
    if (path === "/api/orders/repeat-candidates")
      return Response.json({ items: [candidate], nextCursor: null, hasMore: false });
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

  const usual = await screen.findByRole("region", { name: "Your usual" });
  expect(within(usual).getByText("2× Veg thali")).toBeTruthy();
  expect(within(usual).getByText("Ordered from this kitchen 3 times")).toBeTruthy();
  expect(within(usual).getByText("Previous total ₹240")).toBeTruthy();
  const past = screen.getByRole("region", { name: "Past orders" });
  await vi.waitFor(() => expect(past.querySelector("img")?.getAttribute("src")).toBe(PHOTO));

  fireEvent.click(within(usual).getByRole("button", { name: "Order like last time" }));
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/cart" }));
});

it("sends the customer to their cart rather than replacing dishes already in it", async () => {
  serve([order(DELIVERED, "DELIVERED")], {
    ...emptyCart,
    items: [{ ...line, kitchenName: "Ammi's" }],
  });
  menu.mockResolvedValue([{ id: DISH }]);
  render(createElement(OrdersPage));

  fireEvent.click(await screen.findByRole("button", { name: "Order like last time" }));
  const status = await screen.findByText(/Your cart already has dishes from Ammi's/);
  expect(status.closest("[role=status]")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Go to cart" }).getAttribute("href")).toBe("/cart");
  expect(navigate).not.toHaveBeenCalled();
});

it("asks for repeat baskets only once something was delivered", async () => {
  const fetch = serve([order("0bde0000-0000-4000-8000-000000000102", "PREPARING")]);
  render(createElement(OrdersPage));
  await screen.findByRole("region", { name: "In progress" });
  expect(screen.queryByRole("region", { name: "Your usual" })).toBeNull();
  expect(
    fetch.mock.calls.some(([url]) => String(url).startsWith("/api/orders/repeat-candidates")),
  ).toBe(false);
});
