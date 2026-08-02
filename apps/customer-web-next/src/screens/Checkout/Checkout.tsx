"use client";

import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { Check, MapPin, Plus, ShieldCheck } from "lucide-react";
import type { CustomerAddress } from "@/lib/address-contract";
import type { CustomerCheckout } from "@/lib/checkout-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { getCart, loadCart, validateCart, cartTotal, type CartItem } from "@/services/api/cravesCart";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";

function money(amount: number, currency = "INR") { try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount); } catch { return `${currency} ${amount}`; } }

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Checking your cart and saved addresses…");

  useEffect(() => {
    void (async () => {
      if (!await loadSession()) { navigate({ to: "/" }); return; }
      await loadCart();
      const nextItems = [...getCart()];
      if (!nextItems.length) { navigate({ to: "/cart" }); return; }
      await validateCart();
      const response = await fetch("/api/customer/addresses", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Saved addresses could not be loaded.");
      setItems(nextItems); setAddresses(body);
      const preferred = body.find((address: CustomerAddress) => address.isDefault) ?? body[0];
      if (preferred) setSelectedId(preferred.id);
      setMessage(body.length ? "Choose where this order should be delivered." : "Add a saved delivery address before checkout.");
    })().catch((error) => setMessage(error instanceof Error ? error.message : "Checkout could not be prepared.")).finally(() => setLoading(false));
  }, [navigate]);

  async function createCheckout() {
    if (!selectedId) return; setBusy(true); setMessage("Creating checkout with backend pricing…");
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliveryAddressId: selectedId, note: note.trim() || null }) });
      const body = await response.json().catch(() => null) as CustomerCheckout & { message?: string };
      if (!response.ok) throw new Error(body?.message || "Checkout could not be created.");
      navigate({ to: "/checkout/$checkoutId/payment", params: { checkoutId: body.id } });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Checkout could not be created."); setBusy(false); }
  }

  return <div className="min-h-screen bg-cream pb-32">
    <CheckoutHeader onBack={() => navigate({ to: "/cart" })} />
    <main className="mx-auto max-w-4xl space-y-5 px-4 pt-6">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold text-ink">Order summary</h2>
        <ul className="mt-3 divide-y divide-border text-sm">{items.map((item) => <li key={item.id} className="flex justify-between py-2"><span className="truncate text-ink">{item.name} <span className="text-muted-foreground">× {item.qty}</span></span><span className="ml-3 font-semibold text-ink">{money(item.lineTotal, item.currency)}</span></li>)}</ul>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3"><span className="text-sm text-muted-foreground">Food subtotal from Cart Service</span><strong className="font-display text-xl text-ink">{money(cartTotal(), items[0]?.currency)}</strong></div>
        <p className="mt-2 text-xs text-muted-foreground">Platform fee, tax, delivery fee and grand total are calculated by Order Service after you choose an address.</p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="font-script text-primary">Deliver to</p><h2 className="font-display text-xl font-bold text-ink">Saved address</h2></div><Link to="/addresses" className="flex items-center gap-1 rounded-full border border-primary px-3 py-2 text-xs font-bold text-primary"><Plus className="h-3.5 w-3.5" /> Manage</Link></div>
        <div className="mt-4 space-y-3">{addresses.map((address) => <label key={address.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${selectedId === address.id ? "border-primary bg-primary/5" : "border-border bg-white"}`}>
          <input type="radio" name="address" checked={selectedId === address.id} onChange={() => setSelectedId(address.id)} className="sr-only" />
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selectedId === address.id ? "border-primary bg-primary text-white" : "border-border"}`}>{selectedId === address.id && <Check className="h-3 w-3" />}</span>
          <span className="min-w-0"><span className="flex items-center gap-2 font-bold text-ink"><MapPin className="h-4 w-4 text-primary" /> {address.addressLabel} {address.isDefault && <small className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">DEFAULT</small>}</span><span className="mt-1 block text-sm text-muted-foreground">{address.recipientName} · {address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ""}, {address.areaName}, {address.city}, {address.state} {address.postalCode}</span></span>
        </label>)}</div>
        {!addresses.length && !loading && <Link to="/addresses" className="btn-primary mt-4 justify-center"><Plus className="h-4 w-4" /> Add delivery address</Link>}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5"><label htmlFor="checkout-note" className="font-display text-lg font-bold text-ink">Note for the kitchen <span className="font-sans text-xs font-normal text-muted-foreground">(optional)</span></label><textarea id="checkout-note" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className="mt-3 min-h-24 w-full rounded-xl border border-border bg-white p-3 text-sm outline-none focus:border-primary" placeholder="Add a preparation note supported by the kitchen…" /></section>
      <p role="status" className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground">{message}</p>
      <div className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /><span>Payment details are collected only in Cashfree hosted checkout. Craves never asks for your card number, CVV or UPI PIN.</span></div>
    </main>
    <div className="fixed inset-x-0 bottom-0 border-t border-border bg-cream/95 p-3 backdrop-blur"><div className="mx-auto max-w-4xl"><button type="button" disabled={loading || busy || !selectedId || !items.length} onClick={() => void createCheckout()} className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Creating checkout…" : "Continue to secure payment"}</button></div></div>
  </div>;
}
