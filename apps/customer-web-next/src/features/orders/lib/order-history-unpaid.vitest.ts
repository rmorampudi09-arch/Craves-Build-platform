// @vitest-environment jsdom
// Synthetic owned orders; no network, cart or session changes.
import { createElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => createElement("a", { href: to, ...rest }, children),
}));
vi.mock("@/features/auth/api/cravesAuth", () => ({ loadSession: async () => ({ id: "fixture-customer" }) }));
vi.mock("@/features/cart/api/cravesCart", () => ({ addToCart: vi.fn(), loadCart: vi.fn(), CartKeptError: class extends Error {} }));
vi.mock("@/features/dish/api/dishes", () => ({ loadKitchenMenu: vi.fn() }));

import OrdersPage from "../screens/OrderHistory";

const UNPAID = "0bde0000-0000-4000-8000-000000000011";
const COOKING = "0bde0000-0000-4000-8000-000000000012";

function order(id: string, kitchenName: string, status: string, minutesAgo: number) {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    id, checkoutId: id, kitchenId: "0bde0000-0000-4000-8000-000000000020", kitchenName, status, currency: "INR",
    foodSubtotal: 300, platformFee: 0, taxAmount: 0, deliveryFee: 0, grandTotal: 300, chefResponseNote: null,
    prepTimeMinutes: null, deliveryAddress: null, createdAt: at, updatedAt: at,
    items: [{
      id: `${id.slice(0, -2)}31`, menuItemId: "0bde0000-0000-4000-8000-000000000041", itemName: "Veg thali",
      category: "Meals", foodType: "VEG", unitPrice: 300, quantity: 1, lineTotal: 300,
    }],
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("lists an unpaid checkout older than 30 minutes under past orders as payment not completed", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([
    order(UNPAID, "Ammi's Dastarkhwan", "PAYMENT_PENDING", 120),
    order(COOKING, "Lakshmi's Kitchen", "PREPARING", 10),
  ])));
  render(createElement(OrdersPage));

  const past = await screen.findByRole("region", { name: "Past orders" });
  expect(within(past).getByText("Payment not completed")).toBeTruthy();
  // Opens the order page that explains it, not live tracking; nothing was paid.
  expect(within(past).getByRole("link", { name: /Ammi's Dastarkhwan/ }).getAttribute("href")).toBe(`/orders/${UNPAID}`);
  expect(within(past).queryByText(/total paid/)).toBeNull();

  const inProgress = screen.getByRole("region", { name: "In progress" });
  expect(within(inProgress).getByRole("link", { name: /Lakshmi's Kitchen/ }).getAttribute("href")).toBe(`/orders/${COOKING}`);
});
