"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, LoaderCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { parseCustomerSubscription, type CustomerSubscription } from "@/lib/subscription-contract";
import { parseSubscriptionPayment, type SubscriptionPayment } from "@/lib/subscription-payment-contract";

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

const INVOICE_ATTEMPTS = 36;
const ACTIVATION_ATTEMPTS = 24;
const POLL_DELAY_MS = 2500;

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
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

function loadCashfree(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-craves-cashfree="v3"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Cashfree sandbox checkout could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.dataset.cravesCashfree = "v3";
    script.referrerPolicy = "strict-origin";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Cashfree sandbox checkout could not be loaded."));
    document.head.appendChild(script);
  });
}

function responseCode(body: unknown): string | null {
  return body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : null;
}

function paymentLabel(status: SubscriptionPayment["status"]): string {
  return status.replaceAll("_", " ").toLowerCase();
}

export function SubscriptionCashfreePayment({ subscriptionId }: { subscriptionId: string }) {
  const [subscription, setSubscription] = useState<CustomerSubscription | null>(null);
  const [payment, setPayment] = useState<SubscriptionPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Preparing your subscription invoice…");
  const [error, setError] = useState("");

  const loadSubscription = useCallback(async (): Promise<CustomerSubscription> => {
    const response = await fetch(`/api/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => null);
    if (response.status === 401) throw new Error("Your session expired. Sign in again.");
    if (!response.ok) throw new Error("Your meal subscription could not be loaded.");
    const parsed = parseCustomerSubscription(body);
    if (!parsed) throw new Error("Craves returned an invalid subscription response.");
    setSubscription(parsed);
    return parsed;
  }, [subscriptionId]);

  const loadPayment = useCallback(async (waitForInvoice: boolean): Promise<SubscriptionPayment | null> => {
    const attempts = waitForInvoice ? INVOICE_ATTEMPTS : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const response = await fetch(`/api/subscriptions/${encodeURIComponent(subscriptionId)}/payment`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => null);
      if (response.status === 401) throw new Error("Your session expired. Sign in again.");
      if (response.status === 404 && responseCode(body) === "SUBSCRIPTION_PAYMENT_NOT_READY") {
        if (attempt < attempts) {
          setMessage(`Preparing your first billing cycle… ${attempt}/${attempts}`);
          await sleep(POLL_DELAY_MS);
          continue;
        }
        return null;
      }
      if (!response.ok) throw new Error("Subscription payment status is temporarily unavailable.");
      const parsed = parseSubscriptionPayment(body);
      if (!parsed || parsed.subscriptionId !== subscriptionId) {
        throw new Error("Craves returned an invalid subscription payment response.");
      }
      setPayment(parsed);
      return parsed;
    }
    return null;
  }, [subscriptionId]);

  const waitForActivation = useCallback(async (): Promise<boolean> => {
    setMessage("Payment received. Activating your meal plan…");
    for (let attempt = 1; attempt <= ACTIVATION_ATTEMPTS; attempt += 1) {
      const current = await loadSubscription();
      if (current.status === "ACTIVE") {
        setMessage("Payment confirmed. Your meal plan is active.");
        return true;
      }
      if (current.status === "PAYMENT_FAILED" || current.status === "CANCELLED") {
        return false;
      }
      if (attempt < ACTIVATION_ATTEMPTS) await sleep(POLL_DELAY_MS);
    }
    setMessage("Payment is confirmed. Meal-plan activation is still processing; refresh in a moment.");
    return false;
  }, [loadSubscription]);

  const prepare = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const currentSubscription = await loadSubscription();
      if (currentSubscription.status === "ACTIVE") {
        setMessage("Your meal plan is already active.");
        await loadPayment(false).catch(() => null);
        return;
      }
      if (currentSubscription.status === "CANCELLED" || currentSubscription.status === "EXPIRED") {
        setMessage(`This meal plan is ${currentSubscription.status.toLowerCase()}.`);
        return;
      }
      const currentPayment = await loadPayment(true);
      if (!currentPayment) {
        setMessage("The subscription was created, but its first invoice is still being prepared. Use Refresh invoice to continue safely.");
        return;
      }
      if (currentPayment.status === "PAID") {
        await waitForActivation();
      } else if (currentPayment.status === "FAILED") {
        setMessage("The last sandbox payment attempt failed. You can safely retry the same subscription invoice.");
      } else if (currentPayment.status === "PAYMENT_PENDING") {
        setMessage("A Cashfree sandbox payment session already exists. Continue payment or refresh its status.");
      } else {
        setMessage("Your subscription invoice is ready for Cashfree sandbox payment.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Subscription payment could not be prepared.");
    } finally {
      setLoading(false);
    }
  }, [loadPayment, loadSubscription, waitForActivation]);

  useEffect(() => {
    void prepare();
  }, [prepare]);

  async function pollPaymentAfterCheckout() {
    setMessage("Cashfree checkout closed. Waiting for the signed payment webhook…");
    for (let attempt = 1; attempt <= ACTIVATION_ATTEMPTS; attempt += 1) {
      const current = await loadPayment(false);
      if (current?.status === "PAID") {
        await waitForActivation();
        return;
      }
      if (current?.status === "FAILED") {
        setMessage("Cashfree reported that the sandbox payment did not complete. You can retry.");
        return;
      }
      if (attempt < ACTIVATION_ATTEMPTS) await sleep(POLL_DELAY_MS);
    }
    setMessage("Cashfree has not confirmed the payment yet. If you completed payment, use Refresh status; Craves will activate only after the signed webhook is processed.");
  }

  async function openCheckout() {
    if (busy || subscription?.status === "ACTIVE") return;
    if (process.env.NEXT_PUBLIC_CASHFREE_MODE !== "sandbox") {
      setError("Meal-plan checkout is locked to Cashfree sandbox in this environment.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setMessage("Creating the Cashfree sandbox payment session…");
      const response = await fetch(`/api/subscriptions/${encodeURIComponent(subscriptionId)}/payment/order`, {
        method: "POST",
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => null);
      if (response.status === 404 && responseCode(body) === "SUBSCRIPTION_PAYMENT_NOT_READY") {
        throw new Error("The first invoice is still being prepared. Refresh the invoice and try again.");
      }
      if (response.status === 401) throw new Error("Your session expired. Sign in again.");
      if (!response.ok) throw new Error("Cashfree sandbox payment order could not be created.");
      const created = parseSubscriptionPayment(body);
      if (!created || created.subscriptionId !== subscriptionId) {
        throw new Error("Craves returned an invalid Cashfree subscription payment response.");
      }
      setPayment(created);
      if (created.status === "PAID") {
        await waitForActivation();
        return;
      }
      if (!created.paymentSessionId) {
        throw new Error("Cashfree did not return a payment session for this subscription invoice.");
      }

      await loadCashfree();
      if (!window.Cashfree) throw new Error("Cashfree sandbox checkout is unavailable.");
      setMessage("Complete the sandbox payment inside Cashfree. Craves never receives your card number, CVV or UPI PIN.");
      await window.Cashfree({ mode: "sandbox" }).checkout({
        paymentSessionId: created.paymentSessionId,
        redirectTarget: "_modal",
      });
      await pollPaymentAfterCheckout();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cashfree sandbox checkout could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const currentSubscription = await loadSubscription();
      const currentPayment = await loadPayment(false);
      if (currentSubscription.status === "ACTIVE") {
        setMessage("Payment confirmed. Your meal plan is active.");
      } else if (!currentPayment) {
        setMessage("The invoice is still being prepared. Try Refresh invoice again shortly.");
      } else if (currentPayment.status === "PAID") {
        await waitForActivation();
      } else if (currentPayment.status === "FAILED") {
        setMessage("The sandbox payment attempt failed. You can retry payment.");
      } else {
        setMessage(`Current payment status: ${paymentLabel(currentPayment.status)}.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Subscription payment status could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }

  const active = subscription?.status === "ACTIVE";
  const closed = subscription?.status === "CANCELLED" || subscription?.status === "EXPIRED";
  const paymentFailed = payment?.status === "FAILED";

  return (
    <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">Cashfree sandbox</p>
          <h2 className="mt-3 text-3xl font-bold">
            {active ? "Meal plan activated" : closed ? "Meal plan unavailable" : "Complete your meal-plan payment"}
          </h2>
        </div>
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${active ? "bg-green-100 text-green-700" : paymentFailed ? "bg-red-100 text-red-700" : "bg-white text-[#6930CA]"}`}>
          {active ? <CheckCircle2 className="h-6 w-6" aria-hidden="true" /> : paymentFailed ? <XCircle className="h-6 w-6" aria-hidden="true" /> : <ShieldCheck className="h-6 w-6" aria-hidden="true" />}
        </span>
      </div>

      {payment && (
        <dl className="mt-6 grid gap-3 rounded-2xl bg-white p-5 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Billing cycle</dt><dd className="font-semibold">{payment.cycleStart} to {payment.cycleEnd}</dd></div>
          <div><dt className="text-slate-500">Amount</dt><dd className="font-semibold">{money(payment.amount, payment.currency)}</dd></div>
          <div><dt className="text-slate-500">Craves payment status</dt><dd className="font-semibold">{paymentLabel(payment.status)}</dd></div>
          <div><dt className="text-slate-500">Cashfree status</dt><dd className="font-semibold">{payment.providerStatus ?? "Not started"}</dd></div>
        </dl>
      )}

      <p role="status" className="mt-5 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-700">
        {loading ? "Preparing your subscription invoice…" : message}
      </p>
      {error && <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}

      {!active && !closed && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy || loading || !payment}
            onClick={() => void openCheckout()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6930CA] px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
            {payment?.status === "PAYMENT_PENDING" ? "Continue Cashfree payment" : payment?.status === "FAILED" ? "Retry sandbox payment" : "Pay with Cashfree sandbox"}
          </button>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void refresh()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#6930CA] px-5 font-bold text-[#6930CA] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
            {payment ? "Refresh status" : "Refresh invoice"}
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
        <Link href={`/subscriptions/${encodeURIComponent(subscriptionId)}`} className="text-[#6930CA]">View meal-plan details</Link>
        <Link href="/subscriptions" className="text-[#6930CA]">My meal plans</Link>
      </div>
      <p className="mt-5 text-xs leading-5 text-slate-500">
        This screen is sandbox-only. Payment credentials are entered only in Cashfree hosted checkout. Craves activates the subscription only after the signed Cashfree webhook and backend payment-status event are processed.
      </p>
    </section>
  );
}
