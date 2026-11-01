// @vitest-environment jsdom
// Synthetic checkout and payment identifiers; no real payment provider is contacted.
import { createElement, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CheckoutPaymentButton,
  type CheckoutPaymentFailure,
} from "@/features/checkout/components/CheckoutPaymentButton";
import type { CustomerCheckout } from "./checkout-contract";
import { paidParcelDue } from "@/shared/lib/paid-parcel";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/shared/lib/session-fetch", () => ({ sessionFetch: (url: string, init?: RequestInit) => fetch(url, init) }));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  loadSession: async () => ({ firstName: "Fixture", lastName: "Customer", phoneNumber: "+910000000000", email: null }),
}));

const CHECKOUT_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const PAYMENT_ID = "33333333-3333-4333-8333-333333333333";
const FAILED = "If money left your account, your bank will return it in 5–7 working days.";
const TIMED_OUT = "This checkout timed out. Review your order again to pay.";
const checkout = {
  id: CHECKOUT_ID, grandTotal: 240, currency: "INR", orders: [{ id: ORDER_ID }], createdAt: new Date().toISOString(),
} as CustomerCheckout;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function paymentStatus(status: string) {
  return Response.json({
    paymentOrderId: PAYMENT_ID, checkoutId: CHECKOUT_ID, provider: "RAZORPAY", providerOrderId: "order_fixture",
    amount: 240, currency: "INR", status, createdAt: "2026-10-10T10:00:00Z", updatedAt: "2026-10-10T10:01:00Z",
  });
}

function paymentSession(headers?: HeadersInit) {
  return Response.json({
    paymentOrderId: PAYMENT_ID, checkoutId: CHECKOUT_ID, provider: "RAZORPAY", providerOrderId: "order_fixture",
    providerPaymentId: null, checkoutKeyId: "rzp_test_fixture", paymentSessionId: null, amount: 240, amountPaise: 24000,
    currency: "INR", status: "CREATED", createdAt: "2026-10-10T10:00:00Z",
  }, { status: 201, headers });
}

type RazorpayOptions = { timeout: number; theme: { color: string }; modal: { ondismiss(): void } };
/** A Razorpay stand-in; open() plays what the customer does in the window. */
function stubRazorpay(open: (options: RazorpayOptions, failed: () => void) => void) {
  const opened: RazorpayOptions[] = [];
  vi.stubGlobal("Razorpay", class {
    options: RazorpayOptions;
    failed: () => void = () => undefined;
    constructor(options: RazorpayOptions) { this.options = options; }
    on(_event: string, handler: () => void) { this.failed = handler; }
    open() { opened.push(this.options); open(this.options, this.failed); }
  });
  return opened;
}

/** Like checkout and the order page: the failure the button reports comes back to it. */
function Harness(props: { checkout: CustomerCheckout; onFailure: (failure: CheckoutPaymentFailure) => void; onPaymentLockChange?: (locked: boolean) => void; onReviewCart?: () => void }) {
  const [failure, setFailure] = useState<CheckoutPaymentFailure>(null);
  return createElement(CheckoutPaymentButton, {
    ...props, previewAmount: 200, currency: "INR", failure, ensureCheckout: async () => props.checkout,
    onFailure: (next) => {
      props.onFailure(next);
      setFailure(next);
    },
  });
}

function renderButton(
  onFailure = vi.fn(),
  onPaymentLockChange?: (locked: boolean) => void,
  extra: { checkout?: CustomerCheckout; onReviewCart?: () => void } = {},
) {
  render(createElement(Harness, { checkout, onFailure, onPaymentLockChange, ...extra }));
  return onFailure;
}

async function settle(ms = 0) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  window.sessionStorage.clear();
  router.replace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

  it("checks by itself every 5 s for the first minute, then every 15 s, and stops at 15 minutes", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => paymentStatus("PAYMENT_PENDING"));
    vi.stubGlobal("fetch", fetch);
    renderButton();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);

    await settle(60_000);
    expect(fetch).toHaveBeenCalledTimes(1 + 12);
    await settle(15_000);
    expect(fetch).toHaveBeenCalledTimes(1 + 13);
    await settle(30 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(1 + 12 + 56);
    // The customer can still ask.
    expect(screen.getByRole("button", { name: "Check status" })).toBeTruthy();
  });

  it("opens the order once the payment is confirmed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => paymentStatus("PAID")));
    renderButton();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/orders/${ORDER_ID}?paid=1`));
    expect(window.sessionStorage.getItem("craves.checkout.paymentPending")).toBeNull();
    // Only a payment confirmed as PAID earns the order page's parcel.
    expect(paidParcelDue(ORDER_ID)).toBe(true);
  });

  it("opens the order when an automatic check finds it paid", async () => {
    vi.useFakeTimers();
    let status = "PAYMENT_PENDING";
    vi.stubGlobal("fetch", vi.fn(async () => paymentStatus(status)));
    renderButton();
    await settle();
    expect(router.replace).not.toHaveBeenCalled();

    status = "PAID";
    await settle(5_000);
    expect(router.replace).toHaveBeenCalledWith(`/orders/${ORDER_ID}?paid=1`);
    expect(paidParcelDue(ORDER_ID)).toBe(true);
  });

  it("allows a retry once the payment is known to have failed, without claiming nothing was charged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => paymentStatus("FAILED")));
    const onFailure = renderButton();
    await waitFor(() => expect(onFailure).toHaveBeenCalledWith({ message: FAILED, retryAllowed: true }));
    expect(window.sessionStorage.getItem("craves.checkout.paymentPending")).toBeNull();
    expect(await screen.findByRole("button", { name: "Try payment again" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(FAILED);
    expect(document.body.textContent).not.toMatch(/not charged|Nothing was charged/);
    expect(router.replace).not.toHaveBeenCalled();
    expect(paidParcelDue(ORDER_ID)).toBe(false);
  });

  it("holds the delivery address while the payment is confirmed and frees it once it failed", async () => {
    const lock = vi.fn();
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(async () => paymentStatus("PAYMENT_PENDING"))
      .mockImplementationOnce(async () => paymentStatus("FAILED")));
    renderButton(vi.fn(), lock);

    await screen.findByText(/Last checked at/);
    expect(lock).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    await waitFor(() => expect(lock).toHaveBeenLastCalledWith(false));
  });

  it("ignores a pending payment recorded for another checkout", () => {
    window.sessionStorage.setItem("craves.checkout.paymentPending",
      JSON.stringify({ checkoutId: ORDER_ID, paymentOrderId: PAYMENT_ID, at: Date.now() }));
    vi.stubGlobal("fetch", vi.fn());
    renderButton();
    expect(screen.getByRole("button", { name: /Pay ₹240/ })).toBeTruthy();
  });
});

describe("the 15 minutes to pay", () => {
  it("gives Razorpay the time left, on the server's clock", async () => {
    // The device clock is 10 minutes slow; the server created the checkout 5 minutes ago, so 10 minutes are left.
    const serverNow = Date.now() + 10 * 60_000;
    vi.stubGlobal("fetch", vi.fn(async () => paymentSession({ date: new Date(serverNow).toUTCString() })));
    const opened = stubRazorpay(() => undefined);
    renderButton(vi.fn(), undefined, { checkout: { ...checkout, createdAt: new Date(serverNow - 5 * 60_000).toISOString() } });

    fireEvent.click(screen.getByRole("button", { name: /Pay ₹240/ }));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0].timeout).toBeGreaterThanOrEqual(595);
    expect(opened[0].timeout).toBeLessThanOrEqual(600);
  });

  it.each([
    // The backend still accepts the payment at 16 minutes (it refuses only after 35): the web's check is the limit.
    ["no time is left", minutesAgo(16), () => paymentSession()],
    ["order-service has closed the checkout (410)", minutesAgo(36), () =>
      Response.json({ error: "PAYMENT_WINDOW_EXPIRED", message: TIMED_OUT }, { status: 410 })],
  ])("doesn't open Razorpay when %s, and offers Review cart", async (_case, createdAt, reply) => {
    vi.stubGlobal("fetch", vi.fn(async () => reply()));
    const opened = stubRazorpay(() => undefined);
    const onReviewCart = vi.fn();
    const onFailure = renderButton(vi.fn(), undefined, { checkout: { ...checkout, createdAt }, onReviewCart });

    fireEvent.click(screen.getByRole("button", { name: /Pay ₹240/ }));
    expect((await screen.findByRole("alert")).textContent).toContain(TIMED_OUT);
    expect(onFailure).toHaveBeenLastCalledWith({ message: TIMED_OUT, retryAllowed: false });
    expect(opened).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Review cart" }));
    expect(onReviewCart).toHaveBeenCalledTimes(1);
  });

  it("keeps Review cart disabled where no cart can be rebuilt (the order page)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "PAYMENT_WINDOW_EXPIRED" }, { status: 410 })));
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: /Pay ₹240/ }));
    const reviewCart = await screen.findByRole("button", { name: "Review cart" });
    expect((reviewCart as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("closing Razorpay before paying", () => {
  const NOT_COMPLETED =
    "Payment not completed. If money left your account, we’ll confirm it here, or your bank will return it in 5–7 working days.";

  function serve(status: () => string) {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? paymentSession() : paymentStatus(status()));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }
  const statusChecks = (fetch: ReturnType<typeof serve>) =>
    fetch.mock.calls.filter(([url, init]) => url === `/api/payments/orders/${PAYMENT_ID}` && !init?.method).length;

  it("looks once, says it wasn't completed without an error, and opens the order if a UPI payment lands later", async () => {
    vi.useFakeTimers();
    let status = "CREATED";
    const fetch = serve(() => status);
    const opened = stubRazorpay((options) => options.modal.ondismiss());
    const onFailure = renderButton();

    fireEvent.click(screen.getByRole("button", { name: /Pay ₹240/ }));
    await settle();
    expect(statusChecks(fetch)).toBe(1);
    expect(screen.getByRole("status").textContent).toBe(NOT_COMPLETED);
    expect(screen.getByRole("button", { name: "Try payment again" })).toBeTruthy();
    expect(opened[0].theme.color).toBe("#F62E18");
    expect(onFailure).not.toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
    expect(screen.queryByRole("alert")).toBeNull();
    // Checkout stays as it was: no order page, no parcel.
    expect(router.replace).not.toHaveBeenCalled();
    expect(paidParcelDue(ORDER_ID)).toBe(false);

    // Approved in the UPI app after the window closed: a quiet check finds it.
    status = "PAID";
    await settle(5_000);
    expect(router.replace).toHaveBeenCalledWith(`/orders/${ORDER_ID}?paid=1`);
    expect(paidParcelDue(ORDER_ID)).toBe(true);
  });

  it("opens the order at once when the one look finds it paid", async () => {
    serve(() => "PAID");
    stubRazorpay((options) => options.modal.ondismiss());
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: /Pay ₹240/ }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/orders/${ORDER_ID}?paid=1`));
    expect(screen.queryByText(NOT_COMPLETED)).toBeNull();
  });

  it("looks quietly for 2 minutes, then stops", async () => {
    vi.useFakeTimers();
    const fetch = serve(() => "CREATED");
    stubRazorpay((options) => options.modal.ondismiss());
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: /Pay ₹240/ }));
    await settle();
    await settle(10 * 60_000);
    // The look on closing, then 12 checks in the first minute and 4 in the second.
    expect(statusChecks(fetch)).toBe(1 + 12 + 4);
    expect(screen.getByRole("status").textContent).toBe(NOT_COMPLETED);
  });

  it("says the payment didn't go through when the bank declined it", async () => {
    serve(() => "CREATED");
    stubRazorpay((options, failed) => {
      failed();
      options.modal.ondismiss();
    });
    const onFailure = renderButton();
    fireEvent.click(screen.getByRole("button", { name: /Pay ₹240/ }));
    expect((await screen.findByRole("alert")).textContent).toContain(FAILED);
    expect(onFailure).toHaveBeenLastCalledWith({ message: FAILED, retryAllowed: true });
    expect(screen.getByRole("button", { name: "Try payment again" })).toBeTruthy();
  });
});
