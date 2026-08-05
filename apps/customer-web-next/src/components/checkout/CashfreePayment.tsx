"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { parseCheckout, type CustomerCheckout } from "@/lib/checkout-contract";
import {
  parsePaymentSession,
  parsePaymentStatus,
  parsePaymentVerification,
  type CustomerPaymentSession,
  type PaymentStatus,
} from "@/lib/payment-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";

declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => {
      checkout(options: {
        paymentSessionId: string;
        redirectTarget: "_modal" | "_self" | "_blank" | "_top";
      }): Promise<unknown>;
    };
  }
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function cashfreeMode(): "sandbox" | "production" {
  const mode = process.env.NEXT_PUBLIC_CASHFREE_MODE;
  if (mode !== "sandbox" && mode !== "production") {
    throw new Error("Cashfree checkout mode is not configured.");
  }
  return mode;
}

function loadCashfree(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-craves-cashfree="v3"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Cashfree checkout could not be loaded.")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.dataset.cravesCashfree = "v3";
    script.referrerPolicy = "strict-origin";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Cashfree checkout could not be loaded."));
    document.head.appendChild(script);
  });
}

function responseMessage(body: unknown, fallback: string): string {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : fallback;
}

function statusLabel(status: PaymentStatus | null): string {
  if (!status) return "Not created";
  return status.replaceAll("_", " ").toLocaleLowerCase("en-IN");
}

export function CashfreePayment({ checkoutId }: { checkoutId: string }) {
  const [checkout, setCheckout] = useState<CustomerCheckout | null>(null);
  const [payment, setPayment] = useState<CustomerPaymentSession | null>(null);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadCheckout = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const session = await loadSession();
      if (!session) {
        window.location.assign("/");
        return;
      }
      const response = await fetch(`/api/checkout/${encodeURIComponent(checkoutId)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseMessage(raw, "Checkout could not be loaded."));
      }
      const parsed = parseCheckout(raw);
      if (!parsed) throw new Error("Craves returned an invalid checkout response.");
      setCheckout(parsed);
      setStatus(parsed.status === "PAID" ? "PAID" : null);
      setMessage(
        parsed.status === "PAID"
          ? "This checkout is already paid."
          : parsed.status === "CANCELLED"
            ? "This checkout was cancelled and cannot be paid."
            : "Ready to create a secure Cashfree payment order.",
      );
    } catch (caught) {
      setCheckout(null);
      setError(
        caught instanceof Error ? caught.message : "Checkout could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [checkoutId]);

  useEffect(() => {
    void loadCheckout();
  }, [loadCheckout]);

  async function createPayment(): Promise<CustomerPaymentSession> {
    if (payment) return payment;
    const response = await fetch("/api/payments/orders", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkoutId }),
    });
    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(responseMessage(raw, "Payment order could not be created."));
    }
    const parsed = parsePaymentSession(raw);
    if (!parsed) throw new Error("Craves returned an invalid payment session.");
    setPayment(parsed);
    setStatus(parsed.status);
    return parsed;
  }

  async function verifyPayment(paymentOrderId = payment?.paymentOrderId) {
    if (!paymentOrderId) {
      setError("Create the payment order before verification.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("Verifying the payment with the Craves backend…");
    try {
      const response = await fetch(
        `/api/payments/orders/${encodeURIComponent(paymentOrderId)}/verify`,
        { method: "POST", credentials: "same-origin" },
      );
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseMessage(raw, "Payment verification failed."));
      }
      const verification = parsePaymentVerification(raw);
      if (!verification) {
        throw new Error("Craves returned an invalid payment verification response.");
      }
      setStatus(verification.status);
      setMessage(
        verification.status === "PAID"
          ? "Payment verified. Your order is now available in My Orders."
          : `Payment is currently ${statusLabel(verification.status)}. Complete Cashfree checkout and verify again.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Payment verification failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openCheckout() {
    if (!checkout || checkout.status !== "PAYMENT_PENDING" || busy) return;
    setBusy(true);
    setError("");
    setMessage("Preparing secure Cashfree checkout…");
    try {
      const nextPayment = await createPayment();
      await loadCashfree();
      if (!window.Cashfree) throw new Error("Cashfree checkout is unavailable.");
      setMessage(
        "Complete payment inside the Cashfree window. Craves does not receive your card number, CVV or UPI PIN.",
      );
      await window.Cashfree({ mode: cashfreeMode() }).checkout({
        paymentSessionId: nextPayment.paymentSessionId,
        redirectTarget: "_modal",
      });
      setMessage("Cashfree checkout closed. Verifying payment status…");
      await verifyPayment(nextPayment.paymentOrderId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Payment checkout could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    if (!payment || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/payments/orders/${encodeURIComponent(payment.paymentOrderId)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseMessage(raw, "Payment status could not be loaded."));
      }
      const parsed = parsePaymentStatus(raw);
      if (!parsed) throw new Error("Craves returned an invalid payment status response.");
      setStatus(parsed.status);
      setMessage(`Current payment status: ${statusLabel(parsed.status)}.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Payment status could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  const paid = checkout?.status === "PAID" || status === "PAID";
  const cancelled = checkout?.status === "CANCELLED" || status === "CANCELLED";

  return (
    <div className="min-h-screen bg-cream text-ink">
      <CheckoutHeader
        onBack={() => window.history.back()}
        title="Secure payment"
        subtitle="Cashfree hosted checkout"
      />
      <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
        {loading ? (
          <div className="mx-auto max-w-2xl space-y-4" aria-hidden="true">
            <div className="h-56 animate-pulse rounded-2xl bg-grey-200" />
            <div className="h-20 animate-pulse rounded-2xl bg-grey-200" />
          </div>
        ) : !checkout ? (
          <section className="mx-auto max-w-xl rounded-2xl border border-error/20 bg-white p-8 text-center shadow-[var(--shadow-card)]">
            <AlertTriangle className="mx-auto h-10 w-10 text-error" aria-hidden="true" />
            <h1 className="mt-4 font-display text-2xl font-bold text-ink">
              Payment checkout unavailable
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => void loadCheckout()} className="btn-primary">
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
              </button>
              <Link
                to="/orders"
                className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold text-ink hover:border-primary"
              >
                View orders
              </Link>
            </div>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            <section className="rounded-2xl border border-border bg-white p-6 shadow-[var(--shadow-card)] md:p-8">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                  paid
                    ? "bg-success/10 text-success"
                    : cancelled || status === "FAILED"
                      ? "bg-error/10 text-error"
                      : "bg-secondary text-primary"
                }`}
              >
                {paid ? (
                  <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                ) : cancelled || status === "FAILED" ? (
                  <XCircle className="h-7 w-7" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-7 w-7" aria-hidden="true" />
                )}
              </div>
              <p className="craves-overline mt-5 text-primary">Checkout #{checkout.id.slice(-8).toUpperCase()}</p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-ink">
                {paid
                  ? "Payment verified"
                  : cancelled
                    ? "Checkout cancelled"
                    : "Pay through Cashfree"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Craves creates the payment order on the backend. Cashfree collects card, UPI and banking details in its hosted checkout.
              </p>

              <dl className="mt-6 space-y-3 rounded-2xl bg-cream p-5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Food subtotal</dt>
                  <dd className="font-semibold text-ink">{money(checkout.foodSubtotal, checkout.currency)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Platform fee</dt>
                  <dd className="font-semibold text-ink">{money(checkout.platformFee, checkout.currency)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd className="font-semibold text-ink">{money(checkout.taxAmount, checkout.currency)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className="font-semibold text-ink">{money(checkout.deliveryFee, checkout.currency)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                  <dt className="font-display text-base font-bold text-ink">Grand total</dt>
                  <dd className="font-display text-2xl font-bold text-ink">
                    {money(checkout.grandTotal, checkout.currency)}
                  </dd>
                </div>
              </dl>

              {!paid && !cancelled && (
                <button
                  type="button"
                  disabled={busy || checkout.status !== "PAYMENT_PENDING"}
                  onClick={() => void openCheckout()}
                  className="btn-primary mt-6 min-h-12 w-full disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                  )}
                  {busy ? "Processing…" : "Pay securely with Cashfree"}
                </button>
              )}

              {payment && !paid && !cancelled && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void verifyPayment()}
                    className="min-h-11 rounded-lg border border-primary px-4 text-sm font-semibold text-contrast-red hover:bg-secondary disabled:opacity-50"
                  >
                    Verify payment
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void refreshStatus()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-ink hover:border-primary disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh status
                  </button>
                </div>
              )}

              {message && (
                <p role="status" className="mt-5 rounded-xl bg-secondary p-3 text-sm leading-6 text-muted-foreground">
                  {message}
                </p>
              )}
              {error && (
                <p role="alert" className="mt-5 rounded-xl border border-error/20 bg-error/5 p-3 text-sm font-medium text-error">
                  {error}
                </p>
              )}

              {paid && (
                <Link to="/orders" className="btn-primary mt-6 inline-flex w-full">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> View your orders
                </Link>
              )}
            </section>

            <aside className="space-y-4 lg:sticky lg:top-24">
              <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
                <p className="craves-overline text-primary">Payment state</p>
                <p className="mt-2 font-display text-xl font-bold capitalize text-ink">
                  {statusLabel(status ?? (checkout.status === "PAID" ? "PAID" : null))}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Only the Craves backend determines whether a payment is paid. Closing the Cashfree window does not by itself confirm payment.
                </p>
              </section>
              <Link
                to="/orders"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink hover:border-primary"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to orders
              </Link>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
