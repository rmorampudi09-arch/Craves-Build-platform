// @vitest-environment jsdom
// The order page reuses checkout's Razorpay step for an unpaid order. Synthetic ids; nothing is paid.
import { createElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  orderId: "0bde0000-0000-4000-8000-000000000010",
  checkoutId: "0bde0000-0000-4000-8000-000000000060",
  orderCheckoutId: "0bde0000-0000-4000-8000-000000000060" as string | null,
  onSettled: vi.fn(),
  payment: vi.fn(),
}));
vi.mock("@/features/orders/components/CustomerOrderStatus", () => ({
  CustomerOrderStatus: ({
    paymentStep,
  }: {
    paymentStep: (props: { order: unknown; onSettled: () => void }) => ReactNode;
  }) =>
    createElement(paymentStep, {
      order: { id: fixture.orderId, checkoutId: fixture.orderCheckoutId, status: "PAYMENT_PENDING" },
      onSettled: fixture.onSettled,
    }),
}));
vi.mock("@/features/checkout/components/CheckoutPaymentButton", () => ({
  CheckoutPaymentButton: (props: { checkout: { grandTotal: number } }) => {
    fixture.payment(props);
    return createElement("button", { type: "button" }, `Pay ₹${props.checkout.grandTotal}`);
  },
}));

import { OrderDetailsPage } from "@/app/orders/[orderId]/order-details-page";

const order = {
  id: fixture.orderId,
  checkoutId: fixture.checkoutId,
  kitchenId: "0bde0000-0000-4000-8000-000000000020",
  kitchenName: "Ammi's Dastarkhwan",
  status: "PAYMENT_PENDING",
  currency: "INR",
  foodSubtotal: 300,
  platformFee: 0,
  taxAmount: 0,
  deliveryFee: 0,
  grandTotal: 300,
  chefResponseNote: null,
  prepTimeMinutes: null,
  deliveryAddress: null,
  items: [],
  createdAt: "2026-10-10T08:00:00Z",
  updatedAt: "2026-10-10T08:00:00Z",
};
const checkout = (overrides: Record<string, unknown> = {}) => ({
  id: fixture.checkoutId,
  status: "PAYMENT_PENDING",
  currency: "INR",
  foodSubtotal: 300,
  platformFee: 0,
  taxAmount: 0,
  deliveryFee: 0,
  grandTotal: 300,
  chargePolicyId: "20000000-0000-0000-0000-000000000001",
  deliveryAddressId: null,
  deliveryAddress: null,
  orders: [order],
  createdAt: "2026-10-10T08:00:00Z",
  ...overrides,
});
function serve(body: unknown, status = 200) {
  const fetch = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  fixture.orderCheckoutId = fixture.checkoutId;
  fixture.onSettled.mockReset();
  fixture.payment.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("offers checkout's payment step while the order's checkout waits for payment", async () => {
  const fetch = serve(checkout());
  render(createElement(OrderDetailsPage, { orderId: fixture.orderId }));
  expect(screen.getByRole("status").textContent).toBe("Getting your payment ready…");
  expect(await screen.findByRole("button", { name: "Pay ₹300" })).toBeTruthy();
  // Named like the app's button at every width, above checkout's Pay bar.
  expect(screen.getByRole("heading", { name: "Continue payment" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Continue payment" })).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith(
    `/api/checkout/${fixture.checkoutId}`,
    expect.objectContaining({ cache: "no-store" }),
  );

  // The order is read again once an attempt ends, not when the button first appears.
  const { onPaymentLockChange } = fixture.payment.mock.lastCall![0] as {
    onPaymentLockChange: (locked: boolean) => void;
  };
  act(() => onPaymentLockChange(false));
  expect(fixture.onSettled).not.toHaveBeenCalled();
  act(() => onPaymentLockChange(true));
  act(() => onPaymentLockChange(false));
  expect(fixture.onSettled).toHaveBeenCalledTimes(1);
});

it.each([
  ["already paid", checkout({ status: "PAID" }), 200],
  [
    "for other orders",
    checkout({ orders: [{ ...order, id: "0bde0000-0000-4000-8000-000000000011" }] }),
    200,
  ],
])("offers no payment when the checkout is %s", async (_case, body, status) => {
  const fetch = serve(body, status);
  render(createElement(OrderDetailsPage, { orderId: fixture.orderId }));
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await act(async () => undefined);
  expect(screen.queryByRole("button")).toBeNull();
  expect(fixture.payment).not.toHaveBeenCalled();
});

it("says when the checkout didn't load and tries again", async () => {
  const fetch = serve({ code: "CHECKOUT_UNAVAILABLE" }, 503);
  render(createElement(OrderDetailsPage, { orderId: fixture.orderId }));
  expect((await screen.findByRole("alert")).textContent).toContain("You haven’t been charged.");
  expect(fixture.payment).not.toHaveBeenCalled();
  fetch.mockResolvedValue(Response.json(checkout()));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: "Pay ₹300" })).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("offers no payment on a meal-plan order, which has no checkout", async () => {
  fixture.orderCheckoutId = null;
  const fetch = serve(checkout());
  render(createElement(OrderDetailsPage, { orderId: fixture.orderId }));
  await act(async () => undefined);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "Continue payment" })).toBeNull();
});
