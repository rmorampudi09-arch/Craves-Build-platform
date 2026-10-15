"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { parseCustomerSubscription, type CustomerSubscription } from "@/features/meal-plans/lib/subscription-contract";
import {
  parseSubscriptionPayment,
  type SubscriptionPayment,
  type SubscriptionPaymentStatus,
} from "@/features/meal-plans/lib/subscription-payment-contract";
import { MEAL_PLAN_STATUS, planDay } from "@/features/meal-plans/lib/meal-plan-copy";
import { sessionFetch } from "@/shared/lib/session-fetch";

const PAYMENT_STATUS: Record<SubscriptionPaymentStatus, string> = {
  PAYMENT_REQUESTED: "Waiting for payment",
  PAYMENT_PENDING: "Confirming payment",
  PAID: "Paid",
  FAILED: "Didn’t go through",
};
const START_FAILED = "We couldn’t start the payment. Nothing was charged. Please try again.";

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open(): void; on(event: "payment.failed", handler: (response: { error?: { description?: string } }) => void): void };
  }
}

type RazorpaySuccess = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string; amount: number; currency: string; order_id: string; name: string; description: string;
  handler(response: RazorpaySuccess): void; modal: { ondismiss(): void }; theme: { color: string };
};

const INVOICE_ATTEMPTS = 30;
const INVOICE_WAIT_MS = 3_000;
const PAYMENT_ATTEMPTS = 20;
const PAYMENT_WAIT_MS = 2_000;
const ACTIVATION_ATTEMPTS = 20;
const ACTIVATION_WAIT_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-craves-subscription-razorpay="v1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay checkout didn’t load. Check your connection and tap Pay again. You haven’t been charged.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.cravesSubscriptionRazorpay = "v1";
    script.referrerPolicy = "strict-origin";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay checkout didn’t load. Check your connection and tap Pay again. You haven’t been charged."));
    document.head.appendChild(script);
  });
}

function responseMessage(body: unknown, fallback: string): string {
  return body && typeof body === "object" && "message" in body && typeof body.message === "string"
    ? body.message
    : fallback;
}

async function loadSubscription(subscriptionId: string): Promise<CustomerSubscription> {
  const response = await sessionFetch(`/api/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => null);
  if (response.status === 401) throw new Error("Your session expired. Sign in again.");
  if (!response.ok) throw new Error(responseMessage(body, "We couldn’t load your meal plan. Please try again."));
  const subscription = parseCustomerSubscription(body);
  if (!subscription || subscription.id !== subscriptionId) {
    throw new Error("We couldn’t load your meal plan. Please try again.");
  }
  return subscription;
}

async function loadPayment(subscriptionId: string): Promise<SubscriptionPayment | null> {
  const response = await sessionFetch(`/api/subscription-payments/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => null);
  if (response.status === 404) return null;
  if (response.status === 401) throw new Error("Your session expired. Sign in again.");
  if (!response.ok) throw new Error(responseMessage(body, "We couldn’t check the payment right now. Please try again."));
  const payment = parseSubscriptionPayment(body);
  if (!payment || payment.subscriptionId !== subscriptionId) {
    throw new Error("We couldn’t check the payment right now. Please try again.");
  }
  return payment;
}

export function SubscriptionRazorpayPayment({ subscriptionId }: { subscriptionId: string }) {
  const [subscription, setSubscription] = useState<CustomerSubscription | null>(null);
  const [payment, setPayment] = useState<SubscriptionPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Getting your bill ready…");
  const [error, setError] = useState("");

  const waitForActivation = useCallback(async () => {
    for (let attempt = 0; attempt < ACTIVATION_ATTEMPTS; attempt += 1) {
      const current = await loadSubscription(subscriptionId);
      setSubscription(current);
      if (current.status === "ACTIVE") {
        setMessage("Payment confirmed.");
        return current;
      }
      if (current.status === "CANCELLED" || current.status === "EXPIRED") {
        return current;
      }
      await sleep(ACTIVATION_WAIT_MS);
    }
    setMessage("Payment confirmed. We’re starting your meal plan — check again in a minute if this doesn’t update.");
    return null;
  }, [subscriptionId]);

  const waitForInvoice = useCallback(async () => {
    setMessage("Getting your bill ready…");
    for (let attempt = 0; attempt < INVOICE_ATTEMPTS; attempt += 1) {
      const current = await loadPayment(subscriptionId);
      if (current) {
        setPayment(current);
        setMessage(
          current.status === "PAID"
            ? "Payment confirmed. Starting your meal plan…"
            : "Your bill is ready. Pay when you’re ready.",
        );
        if (current.status === "PAID") await waitForActivation();
        return current;
      }
      await sleep(INVOICE_WAIT_MS);
    }
    setMessage("Your bill is still being prepared. Nothing has been charged — check again in a minute.");
    return null;
  }, [subscriptionId, waitForActivation]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const current = await loadSubscription(subscriptionId);
      setSubscription(current);
      if (current.status === "ACTIVE") {
        setMessage(""); // The heading already says the plan is active.
        return;
      }
      if (current.status === "CANCELLED" || current.status === "EXPIRED") {
        setMessage("This meal plan has ended, so there’s nothing to pay.");
        return;
      }
      await waitForInvoice();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t get your bill ready. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [subscriptionId, waitForInvoice]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  async function refreshInvoice() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const currentSubscription = await loadSubscription(subscriptionId);
      setSubscription(currentSubscription);
      const currentPayment = await loadPayment(subscriptionId);
      setPayment(currentPayment);
      if (!currentPayment) {
        setMessage("Your bill is still being prepared. Nothing has been charged.");
      } else if (currentPayment.status === "PAID") {
        setMessage("Payment confirmed. Starting your meal plan…");
        await waitForActivation();
      } else {
        setMessage(`Payment: ${PAYMENT_STATUS[currentPayment.status].toLowerCase()}.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t check the payment right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function pollPaymentAfterCheckout(): Promise<SubscriptionPayment | null> {
    let latest: SubscriptionPayment | null = null;
    for (let attempt = 0; attempt < PAYMENT_ATTEMPTS; attempt += 1) {
      const current = await loadPayment(subscriptionId);
      if (current) {
        latest = current;
        setPayment(current);
        if (current.status === "PAID") return current;
      }
      await sleep(PAYMENT_WAIT_MS);
    }
    return latest;
  }

  async function openRazorpay() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let currentPayment = payment ?? await waitForInvoice();
      if (!currentPayment) {
        throw new Error("Your bill isn’t ready yet. Check again in a minute.");
      }
      if (currentPayment.status === "PAID") {
        await waitForActivation();
        return;
      }

      const response = await sessionFetch(
        `/api/subscription-payments/invoices/${encodeURIComponent(currentPayment.invoiceId)}/orders`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionId }),
        },
      );
      const body = await response.json().catch(() => null);
      if (response.status === 401) throw new Error("Your session expired. Sign in again.");
      if (!response.ok) throw new Error(responseMessage(body, START_FAILED));
      const ordered = parseSubscriptionPayment(body);
      if (!ordered || ordered.subscriptionId !== subscriptionId || ordered.invoiceId !== currentPayment.invoiceId) {
        throw new Error(START_FAILED);
      }
      currentPayment = ordered;
      setPayment(ordered);

      if (ordered.status === "PAID") {
        await waitForActivation();
        return;
      }
      if (!ordered.checkoutKeyId || !ordered.providerOrderId) {
        throw new Error(START_FAILED);
      }

      setMessage("Opening Razorpay…");
      await loadRazorpay();
      if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable.");
      // Razorpay stays open after a declined attempt so the customer can retry
      // there; only success or closing the window settles this payment.
      let bankFailure = "";
      const result = await new Promise<RazorpaySuccess | null>((resolve, reject) => {
        let settled = false;
        const checkout = new window.Razorpay!({
          key: ordered.checkoutKeyId!, amount: Math.round(ordered.amount * 100), currency: ordered.currency,
          order_id: ordered.providerOrderId!, name: "Craves", description: `Meal-plan invoice ${ordered.invoiceId.slice(-8).toUpperCase()}`,
          handler: response => {
            if (settled) return;
            settled = true;
            resolve(response);
          },
          modal: {
            ondismiss: () => {
              if (settled) return;
              settled = true;
              if (bankFailure) reject(new Error(`${bankFailure} You haven’t been charged. You can try again.`));
              else resolve(null);
            },
          },
          theme: { color: "#F62E18" },
        });
        checkout.on("payment.failed", response => {
          bankFailure = response.error?.description || "Your bank declined the payment.";
        });
        checkout.open();
      });
      if (!result) {
        setMessage("Payment cancelled. You haven’t been charged.");
        return;
      }
      const verificationResponse = await sessionFetch(`/api/subscription-payments/invoices/${encodeURIComponent(ordered.invoiceId)}/verify`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, providerOrderId: result.razorpay_order_id,
          providerPaymentId: result.razorpay_payment_id, providerSignature: result.razorpay_signature }),
      });
      const verificationBody = await verificationResponse.json().catch(() => null);
      const unconfirmed = "We couldn’t confirm the payment yet. Please don’t pay again — check the status in a minute.";
      if (!verificationResponse.ok) throw new Error(responseMessage(verificationBody, unconfirmed));
      const verified = parseSubscriptionPayment(verificationBody);
      if (!verified || verified.invoiceId !== ordered.invoiceId) throw new Error(unconfirmed);
      setPayment(verified);
      setMessage("Payment received. Confirming…");
      const settled = await pollPaymentAfterCheckout();
      if (settled?.status === "PAID") {
        setMessage("Payment confirmed. Starting your meal plan…");
        await waitForActivation();
      } else if (settled?.status === "FAILED") {
        setMessage("The payment didn’t go through. You haven’t been charged — you can try again.");
      } else {
        setMessage("We’re still confirming your payment. Please don’t pay again — check the status in a minute.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : START_FAILED);
    } finally {
      setBusy(false);
    }
  }

  const active = subscription?.status === "ACTIVE";
  const terminal = subscription?.status === "CANCELLED" || subscription?.status === "EXPIRED";
  const paid = payment?.status === "PAID";
  const canPay = !loading && !active && !terminal && payment !== null && !paid;

  const linkClass =
    "inline-flex min-h-11 items-center justify-center rounded-full bg-[#F1F3F5] px-5 text-sm font-bold text-[#1A1A1A]";

  return (
    <section className="max-w-2xl rounded-2xl border border-[#E5E7EB] bg-white p-5 text-[#1A1A1A] sm:p-6">
      <h2 className="text-xl font-bold">
        {active ? "Your meal plan is active" : paid ? "Payment confirmed" : "Your bill"}
      </h2>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-[#F1F3F5] p-4">
          <dt className="text-[#6B6B6B]">Meal plan</dt>
          <dd className="mt-1 font-semibold">{subscription ? MEAL_PLAN_STATUS[subscription.status] : "Loading…"}</dd>
        </div>
        <div className="rounded-xl bg-[#F1F3F5] p-4">
          <dt className="text-[#6B6B6B]">Payment</dt>
          <dd className="mt-1 font-semibold">{payment ? PAYMENT_STATUS[payment.status] : "Bill being prepared"}</dd>
        </div>
        {payment && (
          <>
            <div className="rounded-xl bg-[#F1F3F5] p-4">
              <dt className="text-[#6B6B6B]">Amount</dt>
              <dd className="mt-1 font-semibold">{money(payment.amount, payment.currency)}</dd>
            </div>
            <div className="rounded-xl bg-[#F1F3F5] p-4">
              <dt className="text-[#6B6B6B]">Covers</dt>
              <dd className="mt-1 font-semibold">{planDay(payment.cycleStart)} – {planDay(payment.cycleEnd)}</dd>
            </div>
          </>
        )}
      </dl>

      {message && <p role="status" className="mt-5 text-sm leading-6 text-[#1A1A1A]">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        {canPay && (
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void openRazorpay()}
            className="craves-primary-action w-full sm:w-auto"
          >
            {busy
              ? "Processing…"
              : payment?.status === "FAILED"
                ? "Try payment again"
                : payment
                  ? `Pay ${money(payment.amount, payment.currency)}`
                  : "Pay"}
          </button>
        )}
        {!active && !terminal && (
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void refreshInvoice()}
            className="min-h-11 rounded-full !border-0 !bg-[#F1F3F5] px-5 text-sm font-bold !text-[#1A1A1A] !shadow-none"
          >
            {payment ? "Check payment status" : "Check again"}
          </button>
        )}
        <Link href={`/subscriptions/${subscriptionId}`} className={linkClass}>
          Plan details
        </Link>
      </div>
    </section>
  );
}
