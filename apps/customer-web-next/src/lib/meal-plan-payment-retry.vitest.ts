// @vitest-environment jsdom
// Synthetic meal-plan, invoice and payment identifiers; no real payment provider is contacted.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SubscriptionRazorpayPayment } from "@/components/subscription-razorpay-payment";

const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";
const PAYMENT_ID = "44444444-4444-4444-8444-444444444444";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function payment(status: string, checkout = false) {
  return {
    id: PAYMENT_ID, invoiceId: INVOICE_ID, subscriptionId: SUBSCRIPTION_ID, cycleStart: "2026-10-12", cycleEnd: "2026-10-19",
    amount: 1499, currency: "INR", status, provider: "RAZORPAY",
    providerOrderId: checkout ? "order_fixture" : null, checkoutKeyId: checkout ? "rzp_test_fixture" : null,
    createdAt: "2026-10-10T10:00:00Z", updatedAt: "2026-10-10T10:00:00Z",
  };
}

it("verifies a successful retry after Razorpay reports a declined first attempt", async () => {
  let paid = false;
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/verify")) {
      paid = true;
      return Response.json(payment("PAID"));
    }
    if (url.includes("/invoices/")) return Response.json(payment("PAYMENT_PENDING", true));
    if (url.includes("/subscription-payments/")) return Response.json(payment(paid ? "PAID" : "PAYMENT_REQUESTED"));
    return Response.json({
      id: SUBSCRIPTION_ID, planId: PLAN_ID, status: paid ? "ACTIVE" : "PENDING_PAYMENT", startDate: "2026-10-12",
      createdAt: "2026-10-10T10:00:00Z", updatedAt: "2026-10-10T10:00:00Z",
    });
  });
  vi.stubGlobal("fetch", fetch);

  let theme = "";
  vi.stubGlobal("Razorpay", class {
    private failed: (response: { error?: { description?: string } }) => void = () => {};
    constructor(private readonly options: { theme: { color: string }; handler(result: object): void }) {
      theme = options.theme.color;
    }
    on(_event: string, handler: (response: { error?: { description?: string } }) => void) { this.failed = handler; }
    open() {
      this.failed({ error: { description: "Card declined." } });
      this.options.handler({ razorpay_payment_id: "pay_fixture", razorpay_order_id: "order_fixture", razorpay_signature: "sig" });
    }
  });

  render(createElement(SubscriptionRazorpayPayment, { subscriptionId: SUBSCRIPTION_ID }));
  fireEvent.click(await screen.findByRole("button", { name: /Pay/ }));

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    `/api/subscription-payments/invoices/${INVOICE_ID}/verify`, expect.anything()));
  expect(theme).toBe("#F62E18");
  expect(await screen.findByRole("heading", { name: "Your meal plan is active" })).toBeTruthy();
  expect(screen.queryByText("Card declined.")).toBeNull();
});
