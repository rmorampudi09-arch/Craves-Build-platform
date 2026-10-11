// @vitest-environment jsdom
// Synthetic checkout and payment identifiers; no real payment provider is contacted.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutPaymentButton } from "@/features/checkout/components/CheckoutPaymentButton";
import type { CustomerCheckout } from "../features/checkout/lib/checkout-contract";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/auth/api/sessionFetch", () => ({ sessionFetch: (url: string, init?: RequestInit) => fetch(url, init) }));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  loadSession: async () => ({ firstName: "Fixture", lastName: "Customer", phoneNumber: "+910000000000", email: null }),
}));

const CHECKOUT_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const PAYMENT_ID = "33333333-3333-4333-8333-333333333333";
const checkout = { id: CHECKOUT_ID, grandTotal: 240, currency: "INR", orders: [{ id: ORDER_ID }] } as CustomerCheckout;

function paymentStatus(status: string) {
  return Response.json({
    paymentOrderId: PAYMENT_ID, checkoutId: CHECKOUT_ID, provider: "RAZORPAY", providerOrderId: "order_fixture",
    amount: 240, currency: "INR", status, createdAt: "2026-10-10T10:00:00Z", updatedAt: "2026-10-10T10:01:00Z",
  });
}

function renderButton(onFailure = vi.fn()) {
  render(createElement(CheckoutPaymentButton, {
    checkout, previewAmount: 200, currency: "INR", failure: null,
    ensureCheckout: async () => checkout, onFailure,
  }));
  return onFailure;
}

beforeEach(() => {
  window.sessionStorage.clear();
  router.replace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("payment pending after a reload", () => {
  beforeEach(() => {
    window.sessionStorage.setItem("craves.checkout.paymentPending",
      JSON.stringify({ checkoutId: CHECKOUT_ID, paymentOrderId: PAYMENT_ID, at: Date.now() }));
  });

  it("keeps Pay hidden and shows when it last checked while the payment is still pending", async () => {
    const fetch = vi.fn(async () => paymentStatus("PAYMENT_PENDING"));
    vi.stubGlobal("fetch", fetch);
    renderButton();

    expect(screen.getByText("We’re confirming your payment.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull();
    await screen.findByText(/Last checked at/);
    expect(fetch).toHaveBeenCalledWith(`/api/payments/orders/${PAYMENT_ID}`, expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(window.sessionStorage.getItem("craves.checkout.paymentPending")).not.toBeNull();
  });

  it("opens the order once the payment is confirmed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => paymentStatus("PAID")));
    renderButton();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/orders/${ORDER_ID}`));
    expect(window.sessionStorage.getItem("craves.checkout.paymentPending")).toBeNull();
  });

  it("allows a retry once the payment is known to have failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => paymentStatus("FAILED")));
    const onFailure = renderButton();
    await waitFor(() => expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ retryAllowed: true })));
    expect(window.sessionStorage.getItem("craves.checkout.paymentPending")).toBeNull();
    expect(await screen.findByRole("button", { name: /Pay ₹240/ })).toBeTruthy();
  });

  it("ignores a pending payment recorded for another checkout", () => {
    window.sessionStorage.setItem("craves.checkout.paymentPending",
      JSON.stringify({ checkoutId: ORDER_ID, paymentOrderId: PAYMENT_ID, at: Date.now() }));
    vi.stubGlobal("fetch", vi.fn());
    renderButton();
    expect(screen.getByRole("button", { name: /Pay ₹240/ })).toBeTruthy();
  });
});

describe("closing Razorpay before paying", () => {
  it("says nothing was charged without treating it as an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      paymentOrderId: PAYMENT_ID, checkoutId: CHECKOUT_ID, provider: "RAZORPAY", providerOrderId: "order_fixture",
      providerPaymentId: null, checkoutKeyId: "rzp_test_fixture", paymentSessionId: null, amount: 240, amountPaise: 24000,
      currency: "INR", status: "CREATED", createdAt: "2026-10-10T10:00:00Z",
    })));
    let options: { theme: { color: string }; modal: { ondismiss(): void } } | null = null;
    vi.stubGlobal("Razorpay", class {
      constructor(value: typeof options) { options = value; }
      on() {}
      open() { options?.modal.ondismiss(); }
    });
    const onFailure = renderButton();

    fireEvent.click(screen.getByRole("button", { name: /Pay ₹240/ }));
    expect(await screen.findByText("Payment cancelled. You haven’t been charged.")).toBeTruthy();
    expect(options!.theme.color).toBe("#F62E18");
    expect(onFailure).not.toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
