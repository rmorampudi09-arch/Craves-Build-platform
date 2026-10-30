// @vitest-environment jsdom
// Synthetic customer, address, kitchen and dishes; no real checkout or payment is created.
import { createElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const KITCHEN = "11111111-1111-4111-8111-111111111111";
const OTHER_KITCHEN = "55555555-5555-4555-8555-555555555555";
const BIRYANI = "22222222-2222-4222-8222-222222222222";
const RAITA = "33333333-3333-4333-8333-333333333333";
const ADDRESS = "44444444-4444-4444-8444-444444444444";
const CHECKOUT_ID = "66666666-6666-4666-8666-666666666666";
const PAYMENT_ID = "77777777-7777-4777-8777-777777777777";

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
    navigate: vi.fn(),
    ensureCheckoutCart: vi.fn(),
    router: { push: vi.fn(), replace: vi.fn() },
  };
});
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => fixture.navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement("a", { href: to }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => fixture.router }));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  loadSession: async () => ({ firstName: "Priya", lastName: "", username: "priya", phoneNumber: "+919000000000" }),
}));
vi.mock("@/features/auth/api/sessionFetch", () => ({ sessionFetch: (url: string, init?: RequestInit) => fetch(url, init) }));
vi.mock("@/features/cart/api/cravesCart", () => ({
  cartCurrency: () => "INR",
  cartTotal: () => 400,
  ensureCheckoutCart: fixture.ensureCheckoutCart,
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

const checkout = {
  id: CHECKOUT_ID, status: "PAYMENT_PENDING", currency: "INR", foodSubtotal: 400, platformFee: 10, taxAmount: 20,
  deliveryFee: 30, grandTotal: 460, chargePolicyId: "20000000-0000-0000-0000-000000000001", deliveryAddressId: ADDRESS,
  deliveryAddress: null, orders: [], createdAt: new Date().toISOString(),
};

/** Addresses, the kitchens near them, and (unless extra answers) a checkout that can't be prepared. */
function serve(kitchensNearby: string[], extra: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const reply = extra(url, init);
    if (reply) return reply;
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
  fixture.navigate.mockReset();
  fixture.ensureCheckoutCart.mockReset();
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
  const pay = await screen.findByRole("button", { name: "Review total" });
  expect((pay as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("radio") as HTMLInputElement).disabled).toBe(false);
});

it("keeps Pay available when the kitchen delivers to the address", async () => {
  const fetch = serve([KITCHEN]);
  render(createElement(CheckoutPage));

  const pay = await screen.findByRole("button", { name: "Review total" });
  await waitFor(() => expect(fixture.loadKitchenMenu).toHaveBeenCalledWith(KITCHEN, { remember: false }));
  expect(fetch.mock.calls.some(([url]) => String(url).startsWith("/api/discovery/kitchens?"))).toBe(true);
  expect(screen.queryByText(/can’t be delivered to this address/)).toBeNull();
  await waitFor(() => expect((pay as HTMLButtonElement).disabled).toBe(false));
  // Opening checkout prices nothing: a checkout (a PAYMENT_PENDING order) is created only when Review total is tapped.
  expect(fetch.mock.calls.some(([url]) => String(url).includes("/api/checkout/operations/"))).toBe(false);
});

it("creates the checkout only when Review total is tapped, then shows the fees and Pay", async () => {
  const fetch = serve([KITCHEN], (url, init) => {
    if (url.startsWith("/api/checkout/operations/") && init?.method === "POST") {
      return Response.json({ operationId: url.split("/").pop(), status: "SUCCEEDED", checkoutId: CHECKOUT_ID });
    }
    if (url === `/api/checkout/${CHECKOUT_ID}`) return Response.json(checkout);
  });
  const created = () => fetch.mock.calls.filter(([url]) => url.startsWith("/api/checkout/operations/"));
  render(createElement(CheckoutPage));

  const review = await screen.findByRole("button", { name: "Review total" });
  await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByText("Tap Review total to see the delivery fee, tax and your final total.")).toBeTruthy();
  expect(created()).toHaveLength(0);

  fireEvent.click(review);
  expect(await screen.findByRole("button", { name: "Pay ₹460" })).toBeTruthy();
  expect(screen.getByText("Delivery fee")).toBeTruthy();
  expect(created()).toHaveLength(1);
  expect(JSON.parse(String(created()[0][1]?.body))).toMatchObject({ deliveryAddressId: ADDRESS });
});

it("Back rebuilds the cart from the checkout and drops it, so the cart is never lost", async () => {
  window.sessionStorage.setItem("craves.checkout.id", CHECKOUT_ID);
  fixture.ensureCheckoutCart.mockResolvedValue(true);
  serve([KITCHEN], (url) => (url === `/api/checkout/${CHECKOUT_ID}` ? Response.json(checkout) : undefined));
  render(createElement(CheckoutPage));
  await screen.findByRole("button", { name: "Pay ₹460" });

  fireEvent.click(screen.getByRole("button", { name: "Go back" }));
  await waitFor(() => expect(fixture.navigate).toHaveBeenCalledWith({ to: "/cart" }));
  expect(fixture.ensureCheckoutCart).toHaveBeenCalledWith(checkout.orders);
  expect(window.sessionStorage.getItem("craves.checkout.id")).toBeNull();
});

it("Back keeps the customer on checkout, with the message, while a payment is being confirmed", async () => {
  window.sessionStorage.setItem("craves.checkout.id", CHECKOUT_ID);
  window.sessionStorage.setItem("craves.checkout.paymentPending", JSON.stringify({ checkoutId: CHECKOUT_ID, paymentOrderId: PAYMENT_ID }));
  serve([KITCHEN], (url) => {
    if (url === `/api/checkout/${CHECKOUT_ID}`) return Response.json(checkout);
    if (url === `/api/payments/orders/${PAYMENT_ID}`) {
      return Response.json({
        paymentOrderId: PAYMENT_ID, checkoutId: CHECKOUT_ID, provider: "RAZORPAY", providerOrderId: "order_fixture",
        amount: 460, currency: "INR", status: "PAYMENT_PENDING", createdAt: "2026-10-10T10:00:00Z", updatedAt: "2026-10-10T10:01:00Z",
      });
    }
  });
  render(createElement(CheckoutPage));
  await screen.findByText(/Last checked at/);

  fireEvent.click(screen.getByRole("button", { name: "Go back" }));
  await act(async () => undefined);
  expect(fixture.navigate).not.toHaveBeenCalled();
  expect(fixture.ensureCheckoutCart).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem("craves.checkout.id")).toBe(CHECKOUT_ID);
  expect(screen.getByText("We’re confirming your payment.")).toBeTruthy();
});
