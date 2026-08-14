"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { CustomerAddress } from "@/lib/address-contract";
import type { CustomerCart } from "@/lib/cart-contract";
import {
  parseCheckoutQuote,
  type CustomerCheckout,
  type CustomerCheckoutQuote,
} from "@/lib/checkout-contract";

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function responseMessage(body: unknown, fallback: string): string {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : fallback;
}

function responseCode(body: unknown): string {
  return body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
    ? body.error
    : "";
}

export function CustomerCheckoutForm() {
  const [cart, setCart] = useState<CustomerCart | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [deliveryAddressId, setDeliveryAddressId] = useState("");
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<CustomerCheckoutQuote | null>(null);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [checkout, setCheckout] = useState<CustomerCheckout | null>(null);
  const [message, setMessage] = useState("Loading cart and addresses…");
  const [busy, setBusy] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/cart", { cache: "no-store" }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.message || "Cart could not be loaded.");
        return body;
      }),
      fetch("/api/customer/addresses", { cache: "no-store" }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.message || "Addresses could not be loaded.");
        return body;
      }),
    ])
      .then(([nextCart, nextAddresses]) => {
        setCart(nextCart);
        setAddresses(nextAddresses);
        const preferred =
          nextAddresses.find((address: CustomerAddress) => address.isDefault) ?? nextAddresses[0];
        setDeliveryAddressId(preferred?.id ?? "");
        setMessage(
          !nextCart.items.length
            ? "Your cart is empty."
            : !nextAddresses.length
              ? "Add a saved address before checkout."
              : "Calculating delivery price from the chef to your address…",
        );
      })
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Checkout information could not be loaded.",
        ),
      );
  }, []);

  useEffect(() => {
    if (!cart?.items.length || !deliveryAddressId || checkout) {
      setQuote(null);
      return;
    }

    const controller = new AbortController();
    setQuoteBusy(true);
    setQuote(null);
    setMessage("Calculating road distance and delivery fee…");

    fetch("/api/checkout/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryAddressId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(responseMessage(body, "Delivery pricing could not be calculated."));
        }
        const parsed = parseCheckoutQuote(body);
        if (!parsed) throw new Error("Craves returned an invalid delivery pricing response.");
        return parsed;
      })
      .then((nextQuote) => {
        if (controller.signal.aborted) return;
        setQuote(nextQuote);
        setMessage("Delivery price calculated from the current road route. Review the total below.");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setQuote(null);
        setMessage(
          error instanceof Error ? error.message : "Delivery pricing could not be calculated.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuoteBusy(false);
      });

    return () => controller.abort();
  }, [cart, deliveryAddressId, checkout, quoteRevision]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!cart?.items.length || !deliveryAddressId || !quote) return;
    setBusy(true);
    setCheckout(null);
    setMessage("Locking the quoted total and creating checkout…");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryAddressId,
          pricingQuoteId: quote.quoteId,
          note: note.trim() || null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (responseCode(body) === "PRICING_QUOTE_STALE") {
          setQuote(null);
          setQuoteRevision((revision) => revision + 1);
          throw new Error("Your cart, address or quote changed. Craves is calculating a fresh delivery price.");
        }
        throw new Error(responseMessage(body, "Checkout could not be created."));
      }
      setCheckout(body);
      setMessage("Checkout created with the price you reviewed. It is ready for secure payment.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
      <form
        onSubmit={submit}
        className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950 shadow-2xl shadow-black/20"
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">
          Delivery details
        </p>
        <label className="mt-5 block text-sm font-semibold">
          Saved delivery address
          <select
            required
            value={deliveryAddressId}
            onChange={(event) => {
              setCheckout(null);
              setDeliveryAddressId(event.target.value);
            }}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3"
          >
            <option value="">Choose an address</option>
            {addresses.map((address) => (
              <option key={address.id} value={address.id}>
                {address.addressLabel}: {address.addressLine1}, {address.areaName}
              </option>
            ))}
          </select>
        </label>
        <Link href="/addresses" className="mt-2 inline-flex text-sm font-semibold text-[#6930CA]">
          Manage saved addresses
        </Link>
        <label className="mt-5 block text-sm font-semibold">
          Order note
          <textarea
            maxLength={500}
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3"
            placeholder="Optional instructions for the chef"
          />
        </label>
        <button
          disabled={busy || quoteBusy || !cart?.items.length || !deliveryAddressId || !quote}
          className="mt-6 w-full rounded-full bg-[#6930CA] px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy
            ? "Creating checkout…"
            : quoteBusy
              ? "Calculating delivery…"
              : "Confirm price & create checkout"}
        </button>
        <p role="status" className="mt-4 text-sm text-slate-600">
          {message}
        </p>
      </form>

      <section className="h-fit rounded-[30px] bg-white p-7 text-slate-950 shadow-2xl shadow-black/15">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">
          {checkout ? "Checkout totals" : quote ? "Payment details" : "Cart preview"}
        </p>

        {!checkout && cart && (
          <>
            <div className="mt-5 space-y-3">
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between gap-4 text-sm">
                  <span>
                    {item.quantity} × {item.itemName}
                  </span>
                  <strong>{formatMoney(item.lineTotal, item.currency)}</strong>
                </div>
              ))}
            </div>

            {!quote && (
              <div className="mt-5 flex justify-between border-t border-slate-200 pt-4">
                <span>Food subtotal</span>
                <strong>{formatMoney(cart.foodSubtotal, cart.currency)}</strong>
              </div>
            )}

            {quote && (
              <>
                <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span>Food subtotal</span>
                    <strong>{formatMoney(quote.foodSubtotal, quote.currency)}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Platform fee</span>
                    <strong>{formatMoney(quote.platformFee, quote.currency)}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>GST on food ({quote.taxes.restaurantGstPercent}%)</span>
                    <strong>{formatMoney(quote.taxAmount, quote.currency)}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Dynamic delivery fee</span>
                    <strong>{formatMoney(quote.deliveryFee, quote.currency)}</strong>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-slate-200 pt-4 text-lg font-bold">
                    <span>Grand total</span>
                    <strong>{formatMoney(quote.grandTotal, quote.currency)}</strong>
                  </div>
                </div>

                <div className="mt-5 space-y-3 rounded-2xl bg-[#FFF8EC] p-4">
                  {quote.deliveries.map((delivery) => (
                    <div key={delivery.kitchenId} className="text-sm leading-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-bold">{delivery.kitchenName}</p>
                          <p className="text-slate-600">
                            {delivery.roadDistanceKm.toFixed(1)} km by road · about {delivery.estimatedTravelMinutes} min
                          </p>
                        </div>
                        <strong>{formatMoney(delivery.deliveryFee, quote.currency)}</strong>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatMoney(delivery.baseDeliveryFee, quote.currency)} up to {delivery.baseDistanceKm.toFixed(0)} km
                        {delivery.extraDistanceKm > 0
                          ? ` + ${delivery.extraDistanceKm.toFixed(1)} km × ${formatMoney(delivery.extraPerKm, quote.currency)}/km`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>

                <details className="mt-4 rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
                  <summary className="cursor-pointer font-semibold text-slate-800">Taxes included in fees</summary>
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between gap-4">
                      <span>GST included in platform fee</span>
                      <span>{formatMoney(quote.taxes.platformTaxIncluded, quote.currency)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>GST included in delivery fee</span>
                      <span>{formatMoney(quote.taxes.deliveryTaxIncluded, quote.currency)}</span>
                    </div>
                  </div>
                </details>

                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Delivery uses the current chef-to-address driving route. The quoted fee has no peak-hour or rain surge and is locked until {new Date(quote.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.
                </p>
              </>
            )}
          </>
        )}

        {checkout && (
          <>
            <dl className="mt-5 space-y-3 text-sm">
              {[
                ["Food subtotal", checkout.foodSubtotal],
                ["Platform fee", checkout.platformFee],
                ["GST on food", checkout.taxAmount],
                ["Delivery fee", checkout.deliveryFee],
              ].map(([label, amount]) => (
                <div key={String(label)} className="flex justify-between">
                  <dt>{label}</dt>
                  <dd>{formatMoney(Number(amount), checkout.currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-4 text-lg font-bold">
                <dt>Grand total</dt>
                <dd>{formatMoney(checkout.grandTotal, checkout.currency)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-slate-600">Checkout reference: {checkout.id}</p>
            <Link
              href={`/checkout/${checkout.id}/payment`}
              className="mt-6 flex w-full justify-center rounded-full bg-[#6930CA] px-6 py-3 text-sm font-bold text-white"
            >
              Continue to payment
            </Link>
            <Link
              href={`/checkout/${checkout.id}`}
              className="mt-3 flex justify-center text-sm font-semibold text-[#6930CA]"
            >
              View checkout details
            </Link>
          </>
        )}
      </section>
    </div>
  );
}

export function CheckoutDetails({ checkoutId }: { checkoutId: string }) {
  const [checkout, setCheckout] = useState<CustomerCheckout | null>(null);
  const [message, setMessage] = useState("Loading checkout…");

  useEffect(() => {
    fetch(`/api/checkout/${checkoutId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.message || "Checkout could not be loaded.");
        return body;
      })
      .then((value) => {
        setCheckout(value);
        setMessage("");
      })
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "Checkout could not be loaded."),
      );
  }, [checkoutId]);

  if (!checkout) {
    return (
      <section className="rounded-[30px] bg-[#FFF8EC] p-8 text-slate-950">
        <p>{message}</p>
      </section>
    );
  }

  return (
    <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950 shadow-2xl shadow-black/20">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">
        {checkout.status.replace("_", " ")}
      </p>
      <h1 className="mt-3 text-3xl font-bold">Checkout {checkout.id.slice(0, 8)}</h1>
      <p className="mt-3 text-sm text-slate-600">
        {checkout.orders.length} chef-specific order{checkout.orders.length === 1 ? "" : "s"}
      </p>
      <dl className="mt-6 space-y-3">
        {[
          ["Food subtotal", checkout.foodSubtotal],
          ["Platform fee", checkout.platformFee],
          ["GST on food", checkout.taxAmount],
          ["Delivery fee", checkout.deliveryFee],
          ["Grand total", checkout.grandTotal],
        ].map(([label, amount]) => (
          <div key={String(label)} className="flex justify-between border-b border-slate-200 pb-3">
            <dt>{label}</dt>
            <dd className="font-bold">{formatMoney(Number(amount), checkout.currency)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/checkout/${checkout.id}/payment`}
          className="rounded-full bg-[#6930CA] px-5 py-3 text-sm font-bold text-white"
        >
          Continue to payment
        </Link>
        <Link
          href="/orders"
          className="rounded-full border border-[#6930CA] px-5 py-3 text-sm font-bold text-[#6930CA]"
        >
          My orders
        </Link>
      </div>
    </section>
  );
}
