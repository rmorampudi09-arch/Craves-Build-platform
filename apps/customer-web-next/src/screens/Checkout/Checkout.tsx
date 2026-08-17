"use client";

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import {
  FaArrowRight,
  FaLocationDot,
  FaPlus,
  FaShieldHalved,
} from "react-icons/fa6";
import {
  parseCustomerAddresses,
  type CustomerAddress,
} from "@/lib/address-contract";
import { parseCheckout } from "@/lib/checkout-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import {
  cartCurrency,
  cartTotal,
  getCart,
  loadCart,
  validateCart,
  type CartItem,
} from "@/services/api/cravesCart";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";
import { CheckoutAddressDialog } from "@/components/checkout/CheckoutAddressDialog";

function money(amount: number, currency = "INR") {
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

function checkoutMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Checkout could not be prepared. Please try again.";
}

function fullAddress(address: CustomerAddress): string {
  return [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.areaName,
    address.city,
    address.state,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const prepareCheckout = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await loadSession();
      if (!session) {
        navigate({ to: "/" });
        return;
      }

      await loadCart();
      const nextItems = getCart();
      if (!nextItems.length) {
        navigate({ to: "/cart" });
        return;
      }
      await validateCart();

      const response = await fetch("/api/customer/addresses", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          raw &&
          typeof raw === "object" &&
          "message" in raw &&
          typeof raw.message === "string"
            ? raw.message
            : "Saved addresses could not be loaded.";
        throw new Error(message);
      }
      const parsed = parseCustomerAddresses(raw);
      if (!parsed) throw new Error("Craves returned an invalid address response.");
      const activeAddresses = parsed.filter((address) => address.active);
      const preferred =
        activeAddresses.find((address) => address.isDefault) ?? activeAddresses[0];

      setItems(nextItems);
      setAddresses(activeAddresses);
      setSelectedId(preferred?.id ?? "");
    } catch (caught) {
      setItems([]);
      setAddresses([]);
      setSelectedId("");
      setError(checkoutMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void prepareCheckout();
  }, [prepareCheckout]);

  async function createCheckout() {
    if (!selectedId || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryAddressId: selectedId,
          note: note.trim() || null,
        }),
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          raw &&
          typeof raw === "object" &&
          "message" in raw &&
          typeof raw.message === "string"
            ? raw.message
            : "Checkout could not be created.";
        throw new Error(message);
      }
      const checkout = parseCheckout(raw);
      if (!checkout) throw new Error("Craves returned an invalid checkout response.");
      navigate({
        to: "/checkout/$checkoutId/payment",
        params: { checkoutId: checkout.id },
      });
    } catch (caught) {
      setError(checkoutMessage(caught));
      setBusy(false);
    }
  }

  const subtotal = cartTotal();
  const currency = cartCurrency();
  const itemCount = items.reduce((total, item) => total + item.qty, 0);
  const selectedAddress = addresses.find((address) => address.id === selectedId);

  return (
    <div className="min-h-screen bg-white pb-32 text-[#1A1A1A]">
      <CheckoutHeader
        onBack={() => navigate({ to: "/cart" })}
        title="Delivery and checkout"
        subtitle="Final charges come from the Order Service"
      />

      <main className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
        {loading ? (
          <div className="space-y-5" aria-hidden="true">
            <div className="h-80 animate-pulse rounded-2xl bg-[#F1F3F5]" />
            <div className="h-64 animate-pulse rounded-2xl bg-[#F1F3F5]" />
          </div>
        ) : error && items.length === 0 ? (
          <section className="rounded-2xl border border-[#F62E18]/20 bg-white p-8 text-center shadow-[0_3px_12px_rgba(0,0,0,0.06)] md:p-12">
            <AlertTriangle className="mx-auto h-10 w-10 text-[#F62E18]" aria-hidden="true" />
            <h1 className="mt-4 font-display text-2xl font-bold text-[#1A1A1A]">
              Checkout could not be prepared
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void prepareCheckout()}
              className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F62E18] px-5 text-sm font-bold text-white transition-colors hover:bg-[#DF2815]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
            </button>
          </section>
        ) : (
          <div className="space-y-5">
            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_12px_rgba(0,0,0,0.06)] md:p-6">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#6B6B6B]">
                  Step 1
                </p>
                <h1 className="mt-1 font-display text-2xl font-bold tracking-[-0.035em] text-[#1A1A1A] md:text-3xl">
                  Delivery address
                </h1>
                <p className="mt-2 text-sm leading-6 text-[#4D4D4D]">
                  <span className="block">
                    Only the address selected for this checkout is shown here.
                  </span>
                  <span className="block">
                    Manage addresses to choose another saved address or add a new one.
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAddressDialogOpen(true)}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl pr-3 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]">
                  <FaPlus className="text-sm" aria-hidden="true" />
                </span>
                Manage address
              </button>

              {!selectedAddress ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[#D8DADD] bg-white p-6 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                    <FaLocationDot className="text-[22px]" aria-hidden="true" />
                  </span>
                  <h2 className="mt-3 font-display text-lg font-bold text-[#1A1A1A]">
                    No current delivery address
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
                    Add or select a mapped address before Craves can calculate serviceability and delivery charges.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddressDialogOpen(true)}
                    className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F62E18] px-5 text-sm font-bold text-white transition-colors hover:bg-[#DF2815]"
                  >
                    <FaPlus className="text-sm" aria-hidden="true" /> Add or select address
                  </button>
                </div>
              ) : (
                <article className="mt-4 rounded-2xl border border-[#F62E18] bg-white p-4 md:p-5">
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                      <FaLocationDot className="text-[22px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-lg font-bold text-[#1A1A1A]">
                          {selectedAddress.addressLabel}
                        </h2>
                        {selectedAddress.isDefault && (
                          <span className="rounded-full bg-[#F1F3F5] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[#1A1A1A]">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[#1A1A1A]">
                        {selectedAddress.recipientName} · {selectedAddress.contactPhoneNumber}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#4D4D4D]">
                        {fullAddress(selectedAddress)}
                      </p>
                    </div>
                  </div>
                </article>
              )}

              <details className="group mt-4 border-t border-[#E5E7EB] pt-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#4D4D4D] [&::-webkit-details-marker]:hidden">
                  <span>Add a note for the kitchen</span>
                  <span className="rounded-full bg-[#F1F3F5] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.05em] text-[#6B6B6B]">
                    Optional
                  </span>
                </summary>
                <label htmlFor="checkout-note" className="mt-3 block">
                  <span className="sr-only">Note for the kitchen</span>
                  <textarea
                    id="checkout-note"
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="min-h-24 w-full resize-y rounded-xl border border-[#D8DADD] bg-white p-3 text-sm text-[#1A1A1A] outline-none placeholder:text-[#9A9A9A] focus:border-[#F62E18]"
                    placeholder="For example: please pack the gravy separately"
                  />
                </label>
                <p className="mt-1 text-right text-xs text-[#6B6B6B]">
                  {note.length}/500
                </p>
              </details>
            </section>

            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_12px_rgba(0,0,0,0.06)] md:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#6B6B6B]">
                Order summary
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-[#1A1A1A] md:text-2xl">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </h2>

              <ul className="mt-4 divide-y divide-[#E5E7EB]">
                {items.map((item) => (
                  <li key={item.id} className="flex gap-4 py-3 text-sm">
                    <span className="min-w-0 flex-1 text-[#1A1A1A]">
                      <span className="block truncate font-semibold">{item.name}</span>
                      <span className="mt-1 block text-xs text-[#6B6B6B]">
                        Quantity {item.qty}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-[#1A1A1A]">
                      {money(item.lineTotal, item.currency)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-center justify-between border-t border-[#E5E7EB] pt-4">
                <span className="text-sm text-[#4D4D4D]">Food subtotal</span>
                <strong className="font-display text-xl font-bold text-[#1A1A1A] md:text-2xl">
                  {money(subtotal, currency)}
                </strong>
              </div>

              <div className="mt-4 flex items-start gap-3 border-t border-[#E5E7EB] pt-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]">
                  <FaShieldHalved className="text-base" aria-hidden="true" />
                </span>
                <p className="pt-0.5 text-xs leading-5 text-[#4D4D4D] md:text-sm md:leading-6">
                  Platform fee, tax, delivery fee and grand total are returned by the Order Service after checkout creation.
                </p>
              </div>
            </section>
          </div>
        )}

        {error && items.length > 0 && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-[#F62E18]/20 bg-white p-3 text-sm font-medium text-[#C92716]"
          >
            {error}
          </p>
        )}
      </main>

      {!loading && items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E7EB] bg-white shadow-[0_-8px_28px_rgba(17,24,39,0.06)]">
          <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 md:px-6">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#6B6B6B]">
                Food subtotal
              </p>
              <p className="font-display text-xl font-bold text-[#1A1A1A]">
                {money(subtotal, currency)}
              </p>
            </div>
            <button
              type="button"
              disabled={busy || !selectedId}
              onClick={() => void createCheckout()}
              className="ml-auto inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#F62E18] px-6 text-sm font-bold text-white transition-colors hover:bg-[#DF2815] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F62E18] sm:flex-none sm:px-8 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              <span>{busy ? "Creating checkout…" : "Continue to secure payment"}</span>
              {!busy && <FaArrowRight className="text-sm" aria-hidden="true" />}
            </button>
          </div>
        </div>
      )}

      <CheckoutAddressDialog
        open={addressDialogOpen}
        selectedId={selectedId}
        onClose={() => setAddressDialogOpen(false)}
        onSelect={setSelectedId}
        onAddressesChange={setAddresses}
      />
    </div>
  );
}
