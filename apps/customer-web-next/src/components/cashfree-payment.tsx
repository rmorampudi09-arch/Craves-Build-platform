"use client";

import { useEffect, useState } from "react";
import type { CustomerCheckout } from "@/lib/checkout-contract";
import type { CustomerPaymentSession, CustomerPaymentStatus, PaymentStatus } from "@/lib/payment-contract";

declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => {
      checkout(options: { paymentSessionId: string; redirectTarget: "_modal" | "_self" | "_blank" | "_top" }): Promise<unknown>;
    };
  }
}

function cashfreeMode(): "sandbox" | "production" {
  const mode = process.env.NEXT_PUBLIC_CASHFREE_MODE;
  if (mode !== "sandbox" && mode !== "production") throw new Error("Cashfree checkout mode is not configured.");
  return mode;
}

function loadCashfree(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-craves-cashfree="v3"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Cashfree checkout could not be loaded.")), { once: true });
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

function money(amount: number, currency: string): string {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

export function CashfreePayment({ checkoutId }: { checkoutId: string }) {
  const [checkout, setCheckout] = useState<CustomerCheckout | null>(null);
  const [payment, setPayment] = useState<CustomerPaymentSession | null>(null);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [message, setMessage] = useState("Loading checkout…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/checkout/${checkoutId}`, { cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body?.message || "Checkout could not be loaded."); return body; })
      .then((value: CustomerCheckout) => { setCheckout(value); setMessage(value.status === "PAID" ? "This checkout is already paid." : "Ready to open secure Cashfree checkout."); })
      .catch(error => setMessage(error instanceof Error ? error.message : "Checkout could not be loaded."));
  }, [checkoutId]);

  async function createPayment(): Promise<CustomerPaymentSession> {
    if (payment) return payment;
    const response = await fetch("/api/payments/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkoutId }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.message || "Payment order could not be created.");
    setPayment(body);
    setStatus(body.status);
    return body;
  }

  async function openCheckout() {
    setBusy(true); setMessage("Preparing secure Cashfree checkout…");
    try {
      const nextPayment = await createPayment();
      await loadCashfree();
      if (!window.Cashfree) throw new Error("Cashfree checkout is unavailable.");
      const cashfree = window.Cashfree({ mode: cashfreeMode() });
      setMessage("Complete payment in the Cashfree window. Craves will verify the result from the backend.");
      await cashfree.checkout({ paymentSessionId: nextPayment.paymentSessionId, redirectTarget: "_modal" });
      setMessage("Cashfree checkout closed. Verifying payment status…");
      await verifyPayment(nextPayment.paymentOrderId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment checkout could not be opened.");
    } finally { setBusy(false); }
  }

  async function verifyPayment(paymentOrderId = payment?.paymentOrderId) {
    if (!paymentOrderId) return setMessage("Create the payment order first.");
    setBusy(true);
    try {
      const response = await fetch(`/api/payments/orders/${paymentOrderId}/verify`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || "Payment verification failed.");
      setStatus(body.status);
      setMessage(body.status === "PAID" ? "Payment verified successfully." : "Payment is not confirmed yet. You can verify again after completing checkout.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment verification failed.");
    } finally { setBusy(false); }
  }

  async function refreshStatus() {
    if (!payment) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/payments/orders/${payment.paymentOrderId}`, { cache: "no-store" });
      const body = await response.json() as CustomerPaymentStatus & { message?: string };
      if (!response.ok) throw new Error(body.message || "Payment status could not be loaded.");
      setStatus(body.status);
      setMessage(`Current Craves payment status: ${body.status.replace("_", " ")}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Payment status could not be loaded."); }
    finally { setBusy(false); }
  }

  return <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950 shadow-2xl shadow-black/20 sm:p-9">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">Cashfree hosted checkout</p>
    <h1 className="mt-3 text-3xl font-bold">Secure payment</h1>
    {checkout && <><p className="mt-4 text-sm text-slate-600">Checkout {checkout.id.slice(0, 8)} · {checkout.status.replace("_", " ")}</p><div className="mt-5 flex justify-between border-y border-slate-200 py-4 text-lg"><span>Amount from Order Service</span><strong>{money(checkout.grandTotal, checkout.currency)}</strong></div></>}
    <p className="mt-5 text-sm leading-6 text-slate-600">Craves creates the Cashfree order on the backend. Card, UPI and banking details are collected only inside Cashfree’s hosted checkout.</p>
    <button type="button" disabled={busy || !checkout || checkout.status === "PAID" || status === "PAID"} onClick={() => void openCheckout()} className="mt-6 w-full rounded-full bg-[#6930CA] px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "Processing…" : status === "PAID" ? "Payment verified" : "Pay securely with Cashfree"}</button>
    {payment && status !== "PAID" && <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void verifyPayment()} className="rounded-full border border-[#6930CA] px-5 py-3 text-sm font-bold text-[#6930CA]">Verify payment</button><button type="button" disabled={busy} onClick={() => void refreshStatus()} className="rounded-full px-5 py-3 text-sm font-bold text-slate-600">Refresh status</button></div>}
    <p role="status" className="mt-5 text-sm text-slate-600">{message}</p>
    {status === "PAID" && <a href="/orders" className="mt-5 inline-flex rounded-full border border-[#6930CA] px-5 py-3 text-sm font-bold text-[#6930CA]">View your orders</a>}
  </section>;
}
