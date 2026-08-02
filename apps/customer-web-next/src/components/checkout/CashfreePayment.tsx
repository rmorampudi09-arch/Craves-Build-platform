"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import type { CustomerCheckout } from "@/lib/checkout-contract";
import type { CustomerPaymentSession, CustomerPaymentStatus, PaymentStatus } from "@/lib/payment-contract";
import { loadSession } from "@/services/auth/cravesAuth";

declare global { interface Window { Cashfree?: (options: { mode: "sandbox" | "production" }) => { checkout(options: { paymentSessionId: string; redirectTarget: "_modal" | "_self" | "_blank" | "_top" }): Promise<unknown> } } }

function money(amount: number, currency: string): string {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
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
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("Cashfree checkout could not be loaded.")), { once: true }); return; }
    const script = document.createElement("script"); script.src = "https://sdk.cashfree.com/js/v3/cashfree.js"; script.async = true; script.dataset.cravesCashfree = "v3"; script.referrerPolicy = "strict-origin"; script.onload = () => resolve(); script.onerror = () => reject(new Error("Cashfree checkout could not be loaded.")); document.head.appendChild(script);
  });
}

export function CashfreePayment({ checkoutId }: { checkoutId: string }) {
  const [checkout, setCheckout] = useState<CustomerCheckout | null>(null);
  const [payment, setPayment] = useState<CustomerPaymentSession | null>(null);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [message, setMessage] = useState("Loading checkout…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!await loadSession()) { window.location.assign("/"); return; }
      const response = await fetch(`/api/checkout/${checkoutId}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Checkout could not be loaded.");
      setCheckout(body); setMessage(body.status === "PAID" ? "This checkout is already paid." : "Ready to open secure Cashfree checkout.");
    })().catch((error) => setMessage(error instanceof Error ? error.message : "Checkout could not be loaded."));
  }, [checkoutId]);

  async function createPayment(): Promise<CustomerPaymentSession> {
    if (payment) return payment;
    const response = await fetch("/api/payments/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkoutId }) });
    const body = await response.json(); if (!response.ok) throw new Error(body?.message || "Payment order could not be created.");
    setPayment(body); setStatus(body.status); return body;
  }
  async function verifyPayment(paymentOrderId = payment?.paymentOrderId) {
    if (!paymentOrderId) { setMessage("Create the payment order first."); return; }
    setBusy(true);
    try { const response = await fetch(`/api/payments/orders/${paymentOrderId}/verify`, { method: "POST" }); const body = await response.json(); if (!response.ok) throw new Error(body?.message || "Payment verification failed."); setStatus(body.status); setMessage(body.status === "PAID" ? "Payment verified successfully." : "Payment is not confirmed yet. You can verify again after completing checkout."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Payment verification failed."); }
    finally { setBusy(false); }
  }
  async function openCheckout() {
    setBusy(true); setMessage("Preparing secure Cashfree checkout…");
    try { const nextPayment = await createPayment(); await loadCashfree(); if (!window.Cashfree) throw new Error("Cashfree checkout is unavailable."); setMessage("Complete payment in the Cashfree window. Craves will verify the result from the backend."); await window.Cashfree({ mode: cashfreeMode() }).checkout({ paymentSessionId: nextPayment.paymentSessionId, redirectTarget: "_modal" }); setMessage("Cashfree checkout closed. Verifying payment status…"); await verifyPayment(nextPayment.paymentOrderId); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Payment checkout could not be opened."); }
    finally { setBusy(false); }
  }
  async function refreshStatus() {
    if (!payment) return; setBusy(true);
    try { const response = await fetch(`/api/payments/orders/${payment.paymentOrderId}`, { cache: "no-store" }); const body = await response.json() as CustomerPaymentStatus & { message?: string }; if (!response.ok) throw new Error(body.message || "Payment status could not be loaded."); setStatus(body.status); setMessage(`Current Craves payment status: ${body.status.replaceAll("_", " ")}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Payment status could not be loaded."); }
    finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-cream px-4 py-8">
    <div className="mx-auto max-w-xl">
      <Link to="/orders" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-ink"><ArrowLeft className="h-4 w-4" /> Back to orders</Link>
      <section className="rounded-3xl border border-border bg-card p-6 shadow-lg sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="h-7 w-7" /></div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-primary">Cashfree hosted checkout</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink">Secure payment</h1>
        {checkout && <div className="mt-5 rounded-2xl border border-border bg-cream p-4">
          <p className="text-xs text-muted-foreground">Checkout #{checkout.id.slice(-8).toUpperCase()} · {checkout.status.replaceAll("_", " ")}</p>
          <div className="mt-3 flex justify-between text-lg text-ink"><span>Backend total</span><strong>{money(checkout.grandTotal, checkout.currency)}</strong></div>
          <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground"><p className="flex justify-between"><span>Food subtotal</span><span>{money(checkout.foodSubtotal, checkout.currency)}</span></p><p className="flex justify-between"><span>Platform fee</span><span>{money(checkout.platformFee, checkout.currency)}</span></p><p className="flex justify-between"><span>Tax</span><span>{money(checkout.taxAmount, checkout.currency)}</span></p><p className="flex justify-between"><span>Delivery</span><span>{money(checkout.deliveryFee, checkout.currency)}</span></p></div>
        </div>}
        <p className="mt-5 text-sm leading-6 text-muted-foreground">Craves creates the payment order on the backend. Card, UPI and banking details are collected only inside Cashfree’s hosted checkout.</p>
        <button type="button" disabled={busy || !checkout || checkout.status === "PAID" || status === "PAID"} onClick={() => void openCheckout()} className="btn-primary mt-6 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"><CreditCard className="h-4 w-4" />{busy ? "Processing…" : status === "PAID" ? "Payment verified" : "Pay securely with Cashfree"}</button>
        {payment && status !== "PAID" && <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void verifyPayment()} className="rounded-full border border-primary px-5 py-2.5 text-sm font-bold text-primary">Verify payment</button><button type="button" disabled={busy} onClick={() => void refreshStatus()} className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-muted-foreground"><RefreshCw className="h-4 w-4" /> Refresh</button></div>}
        <p role="status" className="mt-5 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">{message}</p>
        {status === "PAID" && <Link to="/orders" className="mt-5 flex items-center justify-center gap-2 rounded-full border border-primary px-5 py-3 text-sm font-bold text-primary"><CheckCircle2 className="h-4 w-4" /> View your orders</Link>}
      </section>
    </div>
  </div>;
}
