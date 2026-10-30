// @vitest-environment jsdom
// Synthetic customer, address, kitchen and dishes; no real checkout or payment is created.
import { createElement, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const KITCHEN = "11111111-1111-4111-8111-111111111111";
const OTHER_KITCHEN = "55555555-5555-4555-8555-555555555555";
const BIRYANI = "22222222-2222-4222-8222-222222222222";
const RAITA = "33333333-3333-4333-8333-333333333333";
const ADDRESS = "44444444-4444-4444-8444-444444444444";

const fixture = vi.hoisted(() => {
  const line = (id: string, menuItemId: string, name: string) => ({
    id, menuItemId, kitchenId: "11111111-1111-4111-8111-111111111111", name, chef: "Fixture kitchen",
    price: 200, img: "/dish.jpg", imageIsPlaceholder: false, qty: 1, currency: "INR", lineTotal: 200,
  });
  return {
    items: [
      line("a1111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "Hyderabadi biryani"),
      line("b1111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333", "Raita"),
    ],
    loadKitchenMenu: vi.fn(),
  };
});
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  loadSession: async () => ({ firstName: "Priya", lastName: "", username: "priya", phoneNumber: "+919000000000" }),
}));
vi.mock("@/shared/lib/session-fetch", () => ({ sessionFetch: (url: string, init?: RequestInit) => fetch(url, init) }));
vi.mock("@/features/cart/api/cravesCart", () => ({
  cartCurrency: () => "INR",
  cartTotal: () => 400,
  ensureCheckoutCart: vi.fn(),
  getCart: () => fixture.items,
  loadCart: async () => fixture.items,
  validateCart: async () => ({ id: "c1111111-1111-4111-8111-111111111111", items: [] }),
}));
vi.mock("@/features/dish/api/dishes", () => ({
  loadDish: async () => {
    throw new Error("not needed");
  },
  loadKitchenMenu: fixture.loadKitchenMenu,
}));
vi.mock("@/features/addresses/components/AddressEditorFlow", () => ({ AddressEditorFlow: () => null }));

import CheckoutPage from "@/features/checkout/screens/Checkout";

const address = {
  id: ADDRESS, addressLabel: "HOME", recipientName: "Priya", contactPhoneNumber: "+919000000000",
  addressLine1: "Flat 302, Sri Sai Residency", addressLine2: null, landmark: null, areaName: "Banjara Hills",
  districtName: "Hyderabad", city: "Hyderabad", state: "Telangana", postalCode: "500034",
  latitude: 17.41, longitude: 78.44, isDefault: true, active: true,
  createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z",
};

/** Addresses, the kitchens near them, and a checkout that can't be prepared (so nothing is created). */
function serve(kitchensNearby: string[]) {
  const fetch = vi.fn(async (url: string) => {
    if (url === "/api/customer/addresses") return Response.json([address]);
    if (url.startsWith("/api/discovery/kitchens?")) {
      return Response.json({
        latitude: 17.41, longitude: 78.44, radiusMeters: 50_000,
        page: { page: 0, size: 50, totalElements: kitchensNearby.length, totalPages: 1, hasNext: false },
        kitchens: kitchensNearby.map((id) => ({
          id, kitchenName: "Fixture kitchen", displayName: null, description: null, areaName: null,
          city: "Hyderabad", state: "Telangana", distanceMeters: 1_200, activeMenuItemCount: 2,
        })),
      });
    }
    return Response.json({ message: "Ordering is temporarily unavailable." }, { status: 503 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  window.sessionStorage.clear();
  fixture.loadKitchenMenu.mockReset();
  fixture.loadKitchenMenu.mockResolvedValue([{ id: BIRYANI }, { id: RAITA }]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("names the dishes that can't reach the chosen address and holds Pay, while the address can still change", async () => {
  serve([OTHER_KITCHEN]);
  render(createElement(CheckoutPage));

  expect(await screen.findByText("Your order can’t be delivered to this address")).toBeTruthy();
  expect(screen.getByText(/Not available here: Hyderabadi biryani × 1, Raita × 1\./)).toBeTruthy();
  const pay = await screen.findByRole("button", { name: "Retry total" });
  expect((pay as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("radio") as HTMLInputElement).disabled).toBe(false);
});

it("keeps Pay available when the kitchen delivers to the address", async () => {
  const fetch = serve([KITCHEN]);
  render(createElement(CheckoutPage));

  const pay = await screen.findByRole("button", { name: "Retry total" });
  await waitFor(() => expect(fixture.loadKitchenMenu).toHaveBeenCalledWith(KITCHEN, { remember: false }));
  expect(fetch.mock.calls.some(([url]) => String(url).startsWith("/api/discovery/kitchens?"))).toBe(true);
  expect(screen.queryByText(/can’t be delivered to this address/)).toBeNull();
  await waitFor(() => expect((pay as HTMLButtonElement).disabled).toBe(false));
});
