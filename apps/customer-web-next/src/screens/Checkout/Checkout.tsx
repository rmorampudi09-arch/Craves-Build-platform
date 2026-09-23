"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clock3,
  MapPin,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  isDeliveryReadyAddress,
  parseCustomerAddresses,
  type CustomerAddress,
} from "@/lib/address-contract";
import {
  parseCheckout,
  type CustomerCheckout,
} from "@/lib/checkout-contract";
import {
  checkoutCartSnapshot,
  parseCheckoutOperationResponse,
} from "@/lib/checkout-operation-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { sessionFetch } from "@/services/auth/sessionFetch";
import {
  cartCurrency,
  cartTotal,
  ensureCheckoutCart,
  getCart,
  loadCart,
  validateCart,
  type CartItem,
} from "@/services/api/cravesCart";
import { loadDish } from "@/services/api/dishes";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";
import {
  CheckoutPaymentButton,
  type CheckoutPaymentFailure,
} from "@/components/checkout/CheckoutPaymentButton";
import { AddressEditorFlow } from "@/components/profile/AddressEditorFlow";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";

const ADDRESS_KEY = "craves.checkout.addressId";
const CHECKOUT_ID_KEY = "craves.checkout.id";
const CHECKOUT_OPERATION_ID_KEY = "craves.checkout.operationId";
const INSTRUCTIONS_KEY = "craves.checkout.instructions";
const CART_NOTICE_KEY = "craves.cart.notice";

function money(amount: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount)}`;
  }
}

function checkoutMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Checkout could not be prepared. Please try again.";
}

function responseMessage(body: unknown, fallback: string): string {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : fallback;
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

async function fetchAddresses(): Promise<CustomerAddress[]> {
  const response = await sessionFetch("/api/customer/addresses", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseMessage(raw, "Saved addresses could not be loaded."));
  }
  const parsed = parseCustomerAddresses(raw);
  if (!parsed) throw new Error("Craves returned an invalid address response.");
  return parsed;
}

async function fetchCheckout(
  checkoutId: string,
): Promise<CustomerCheckout | null> {
  const response = await sessionFetch(
    `/api/checkout/${encodeURIComponent(checkoutId)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const raw = await response.json().catch(() => null);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(responseMessage(raw, "Checkout could not be restored."));
  }
  const parsed = parseCheckout(raw);
  if (!parsed) throw new Error("Craves returned an invalid checkout response.");
  return parsed;
}

async function fetchCheckoutOperation(
  operationId: string,
) {
  const response = await sessionFetch(
    `/api/checkout/operations/${encodeURIComponent(operationId)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const raw = await response.json().catch(() => null);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      responseMessage(raw, "Checkout attempt could not be restored."),
    );
  }
  const parsed = parseCheckoutOperationResponse(raw);
  if (!parsed) {
    throw new Error("Craves returned an invalid checkout attempt response.");
  }
  return parsed;
}

async function createAuthoritativeCheckout(
  operationId: string,
  deliveryAddressId: string,
  note: string,
): Promise<CustomerCheckout> {
  const validatedCart = await validateCart();
  const response = await sessionFetch(
    `/api/checkout/operations/${encodeURIComponent(operationId)}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryAddressId,
        note: note.trim() || null,
        expectedCart: checkoutCartSnapshot(validatedCart),
      }),
    },
  );
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseMessage(raw, "Checkout could not be created."));
  }

  const operation = parseCheckoutOperationResponse(raw);
  if (!operation) {
    throw new Error("Craves returned an invalid checkout attempt response.");
  }

  const checkout = await fetchCheckout(operation.checkoutId);
  if (!checkout) {
    throw new Error("Checkout was created but could not be loaded.");
  }
  return checkout;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const prepareStartedRef = useRef(false);
  const autoReviewKeyRef = useRef("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [showAllAddresses, setShowAllAddresses] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [profileDefaults, setProfileDefaults] = useState({
    recipientName: "",
    contactPhoneNumber: "",
  });
  const [leadMinutes, setLeadMinutes] = useState<number | null>(null);
  const [instructions, setInstructions] = useState("");
  const [checkout, setCheckout] = useState<CustomerCheckout | null>(null);
  const [paymentFailure, setPaymentFailure] =
    useState<CheckoutPaymentFailure>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [addressChangeBusy, setAddressChangeBusy] = useState(false);
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

      setProfileDefaults({
        recipientName:
          [session.firstName, session.lastName].filter(Boolean).join(" ").trim() ||
          session.username ||
          "",
        contactPhoneNumber: session.phoneNumber || session.phone || "",
      });

      const savedInstructions =
        window.sessionStorage.getItem(INSTRUCTIONS_KEY) ?? "";
      setInstructions(savedInstructions);

      const parsedAddresses = await fetchAddresses();
      const activeAddresses = parsedAddresses.filter(isDeliveryReadyAddress);
      setAddresses(activeAddresses);

      const lastUsedId = window.sessionStorage.getItem(ADDRESS_KEY);
      const preferred =
        activeAddresses.find((address) => address.isDefault) ??
        activeAddresses.find((address) => address.id === lastUsedId) ??
        activeAddresses[0];

      const storedCheckoutId = window.sessionStorage.getItem(CHECKOUT_ID_KEY);
      if (storedCheckoutId) {
        try {
          const restored = await fetchCheckout(storedCheckoutId);
          if (restored?.status === "PAYMENT_PENDING") {
            setCheckout(restored);
            setSelectedId(restored.deliveryAddressId ?? preferred?.id ?? "");
            setItems([]);
            setLeadMinutes(null);
            return;
          }
          window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
          window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
        } catch {
          window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
        }
      }

      const storedOperationId =
        window.sessionStorage.getItem(CHECKOUT_OPERATION_ID_KEY);
      if (storedOperationId) {
        try {
          const operation = await fetchCheckoutOperation(storedOperationId);
          if (operation) {
            const restored = await fetchCheckout(operation.checkoutId);
            if (restored?.status === "PAYMENT_PENDING") {
              window.sessionStorage.setItem(
                CHECKOUT_ID_KEY,
                operation.checkoutId,
              );
              setCheckout(restored);
              setSelectedId(restored.deliveryAddressId ?? preferred?.id ?? "");
              setItems([]);
              setLeadMinutes(null);
              return;
            }
          }
          window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
        } catch {
          window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
        }
      }

      await loadCart();
      const nextItems = getCart();
      if (!nextItems.length) {
        navigate({ to: "/cart" });
        return;
      }
      await validateCart();

      const dishResults = await Promise.allSettled(
        nextItems.map((item) => loadDish(item.menuItemId)),
      );
      const minutes = dishResults
        .flatMap((result) => {
          if (result.status !== "fulfilled") return [];
          const match = /^(\d+)\s*min$/i.exec(result.value.time);
          return match ? [Number(match[1])] : [];
        })
        .filter((value) => Number.isFinite(value) && value > 0);

      setItems(nextItems);
      setSelectedId(preferred?.id ?? "");
      setLeadMinutes(minutes.length ? Math.max(...minutes) : null);
      setCheckout(null);
    } catch (caught) {
      setItems([]);
      setAddresses([]);
      setSelectedId("");
      setLeadMinutes(null);
      setError(checkoutMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (prepareStartedRef.current) return;
    prepareStartedRef.current = true;
    void prepareCheckout();
  }, [prepareCheckout]);

  async function resetCheckoutForAddressChange(): Promise<void> {
    if (!checkout) return;

    try {
      const restored = await ensureCheckoutCart(checkout.orders);
      if (!restored) {
        throw new Error("CHECKOUT_CART_RESTORE_FAILED");
      }
      setItems(getCart());
    } catch {
      throw new Error(
        "We couldn’t update the delivery address while keeping this checkout intact. Go back to your cart, review the items, and continue again.",
      );
    } finally {
      window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
      window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
      setCheckout(null);
    }
  }

  async function selectAddress(id: string) {
    if (addressChangeBusy || (id === selectedId && checkout)) return;

    setAddressChangeBusy(true);
    setError("");
    try {
      await resetCheckoutForAddressChange();
      autoReviewKeyRef.current = "";
      setSelectedId(id);
      window.sessionStorage.setItem(ADDRESS_KEY, id);
      window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
      setPaymentFailure(null);
    } catch (caught) {
      setError(checkoutMessage(caught));
    } finally {
      setAddressChangeBusy(false);
    }
  }

  async function openAddressEditor() {
    if (addressChangeBusy) return;

    setAddressChangeBusy(true);
    setError("");
    try {
      await resetCheckoutForAddressChange();
      autoReviewKeyRef.current = "";
      setPaymentFailure(null);
      setEditorOpen(true);
    } catch (caught) {
      setError(checkoutMessage(caught));
    } finally {
      setAddressChangeBusy(false);
    }
  }

  const ensureCheckout = useCallback(async (): Promise<CustomerCheckout> => {
    if (checkout) return checkout;
    if (!selectedId) {
      throw new Error("Choose a delivery address before continuing.");
    }

    const operationId =
      window.sessionStorage.getItem(CHECKOUT_OPERATION_ID_KEY) ??
      crypto.randomUUID();
    window.sessionStorage.setItem(CHECKOUT_OPERATION_ID_KEY, operationId);

    const prepared = await createAuthoritativeCheckout(
      operationId,
      selectedId,
      instructions,
    );
    window.sessionStorage.setItem(CHECKOUT_ID_KEY, prepared.id);
    setCheckout(prepared);
    setPaymentFailure(null);
    return prepared;
  }, [checkout, instructions, selectedId]);

  useEffect(() => {
    if (
      loading ||
      reviewing ||
      addressChangeBusy ||
      checkout ||
      !selectedId ||
      items.length === 0 ||
      paymentFailure
    ) {
      return;
    }

    const reviewKey = `${selectedId}:${instructions.trim()}`;
    if (autoReviewKeyRef.current === reviewKey) return;
    autoReviewKeyRef.current = reviewKey;

    setReviewing(true);
    void ensureCheckout()
      .catch((caught) => {
        setPaymentFailure({
          message: checkoutMessage(caught),
          retryAllowed: true,
        });
      })
      .finally(() => setReviewing(false));
  }, [
    addressChangeBusy,
    checkout,
    ensureCheckout,
    instructions,
    items.length,
    loading,
    paymentFailure,
    reviewing,
    selectedId,
  ]);

  async function handleBackToCart() {
    setError("");

    if (checkout) {
      try {
        const restored = await ensureCheckoutCart(checkout.orders);
        if (!restored) {
          window.sessionStorage.setItem(
            CART_NOTICE_KEY,
            "Some checkout items could not be restored automatically. Please review your cart before continuing.",
          );
        }
      } catch {
        window.sessionStorage.setItem(
          CART_NOTICE_KEY,
          "We opened your cart, but Craves could not restore every checkout item automatically. Please review the cart before continuing.",
        );
      } finally {
        window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
        window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
        setCheckout(null);
      }
    }

    navigate({ to: "/cart" });
  }

  async function handleAddressSaved(saved: CustomerAddress | null) {
    const next = (await fetchAddresses()).filter(isDeliveryReadyAddress);
    setAddresses(next);
    setEditorOpen(false);

    const selected =
      saved && isDeliveryReadyAddress(saved)
        ? next.find((address) => address.id === saved.id)
        : null;
    if (selected) {
      await selectAddress(selected.id);
    } else if (!selectedId && next[0]) {
      await selectAddress(next[0].id);
    }
  }

  const subtotal = checkout?.foodSubtotal ?? cartTotal();
  const currency = checkout?.currency ?? cartCurrency();
  const selectedAddress = addresses.find((address) => address.id === selectedId);
  const visibleAddresses = showAllAddresses ? addresses : addresses.slice(0, 3);
  const hasCheckoutContext = items.length > 0 || checkout !== null;

  if (loading) {
    return <CustomerPageSkeleton label="Preparing your checkout" />;
  }

  return (
    <div className="min-h-screen bg-[#F7F7F7] pb-36 text-[#1A1A1A] lg:pb-12">
      <CheckoutHeader
        onBack={() => void handleBackToCart()}
        title="Checkout"
        subtitle="Choose delivery, then pay securely"
      />

      <main className="mx-auto max-w-[1180px] px-4 py-5 md:px-6 md:py-8 lg:px-8 lg:py-9">
        {loading ? (
          <div className="space-y-4" aria-hidden="true">
            <div className="h-64 animate-pulse rounded-[1.25rem] bg-[#F1F3F5]" />
            <div className="h-28 animate-pulse rounded-[1.25rem] bg-[#F1F3F5]" />
            <div className="h-52 animate-pulse rounded-[1.25rem] bg-[#F1F3F5]" />
          </div>
        ) : error && !hasCheckoutContext ? (
          <section className="rounded-[1.25rem] border border-[#F62E18]/20 bg-white p-8 text-center shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
            <AlertTriangle className="mx-auto h-9 w-9 text-[#F62E18]" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-semibold">Checkout could not be prepared</h1>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{error}</p>
            <button
              type="button"
              onClick={() => void prepareCheckout()}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F62E18] px-5 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
          </section>
        ) : (
          <div>
            <div className="mb-6 hidden lg:block">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#F62E18]">
                Secure checkout
              </p>
              <div className="mt-1 flex items-end justify-between gap-6">
                <div>
                  <h1 className="text-3xl font-black tracking-[-0.04em] text-[#1A1A1A]">
                    Delivery & payment
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6B6B6B]">
                    Choose where to deliver. Craves calculates the final total automatically before payment.
                  </p>
                </div>
                <span className="rounded-full border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#6B6B6B] shadow-[0_2px_8px_rgba(26,26,26,0.04)]">
                  {items.length} {items.length === 1 ? "item" : "items"} in this order
                </span>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-7 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="space-y-4">
                {paymentFailure ? (
                  <section
                    role="alert"
                    className="rounded-[1.25rem] border border-[#C92716]/20 bg-[#FFF2F0] p-4"
                  >
                    <h2 className="text-sm font-semibold text-[#9F2114]">
                      {checkout
                        ? "Payment didn't go through"
                        : "Order could not be prepared"}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-[#7A2C22]">
                      {paymentFailure.message}
                    </p>
                  </section>
                ) : null}

                <section className="overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-white shadow-[0_8px_28px_rgba(26,26,26,0.055)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[#F1F3F5] px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF1EF] text-[#F62E18]">
                        <MapPin className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#F62E18]">
                          Step 1
                        </p>
                        <h2 className="text-base font-bold">Delivery address</h2>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openAddressEditor()}
                      disabled={addressChangeBusy}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-[#D7DADF] bg-white px-3 text-xs font-bold text-[#1A1A1A] shadow-[0_1px_2px_rgba(26,26,26,0.06)] transition hover:border-[#F62E18]/25 hover:bg-[#FFF8F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/25 disabled:pointer-events-none disabled:opacity-45"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Add new
                    </button>
                  </div>

                  {visibleAddresses.length ? (
                    <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-1 xl:grid-cols-2">
                      {visibleAddresses.map((address) => {
                        const checked = address.id === selectedId;
                        return (
                          <label
                            key={address.id}
                            className={[
                              "relative flex min-h-[116px] cursor-pointer items-start gap-3 rounded-[1rem] border p-3.5 transition-[border-color,background-color,box-shadow] focus-within:ring-2 focus-within:ring-[#F62E18]/20",
                              checked
                                ? "border-[#F62E18]/40 bg-[#FFF8F6] shadow-[0_5px_16px_rgba(246,46,24,0.08)]"
                                : "border-[#E5E7EB] bg-white hover:border-[#C8CDD2] hover:bg-[#FAFAFA]",
                            ].join(" ")}
                          >
                            <input
                              type="radio"
                              name="delivery-address"
                              value={address.id}
                              checked={checked}
                              disabled={addressChangeBusy}
                              onChange={() => void selectAddress(address.id)}
                              className="mt-1 h-4 w-4 shrink-0 accent-[#F62E18] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold capitalize">
                                  {address.addressLabel.toLowerCase()}
                                </span>
                                {address.isDefault ? (
                                  <span className="rounded-full bg-[#F62E18]/10 px-2 py-0.5 text-[10px] font-bold text-[#F62E18]">
                                    Default
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-1.5 block text-xs leading-5 text-[#6B6B6B]">
                                {fullAddress(address)}
                              </span>
                            </span>
                          </label>
                        );
                      })}

                      {addresses.length > 3 ? (
                        <button
                          type="button"
                          onClick={() => setShowAllAddresses((current) => !current)}
                          className="min-h-11 rounded-[1rem] border border-dashed border-[#D7DADF] bg-[#FAFAFA] px-4 text-sm font-bold text-[#1A1A1A] transition hover:border-[#F62E18]/30 hover:bg-[#FFF8F6] sm:col-span-2 lg:col-span-1 xl:col-span-2"
                        >
                          {showAllAddresses
                            ? "Show fewer addresses"
                            : `Show all ${addresses.length} addresses`}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm font-bold">No delivery address yet</p>
                      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#6B6B6B]">
                        Add a mapped address so Craves can check delivery serviceability and calculate your final total.
                      </p>
                      <button
                        type="button"
                        onClick={() => void openAddressEditor()}
                        disabled={addressChangeBusy}
                        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F62E18] px-4 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-45"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add a new address
                      </button>
                    </div>
                  )}
                </section>

                <section className="rounded-[1.45rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_28px_rgba(26,26,26,0.05)] sm:p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF8EC] text-[#B86E00]">
                      <Clock3 className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#F62E18]">
                        Step 2
                      </p>
                      <h2 className="text-base font-bold">Delivery timing</h2>
                    </div>
                  </div>
                  <div className="mt-4 flex items-start gap-3 rounded-[1rem] border border-[#F6B545]/35 bg-[#FFF8EC] p-4">
                    <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#F6B545]" />
                    <div>
                      <p className="text-xs font-semibold text-[#7B5A1A]">Earliest delivery</p>
                      <p className="mt-0.5 text-base font-black text-[#1A1A1A]">As soon as possible</p>
                      <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                        {leadMinutes
                          ? `Your chef usually needs about ${leadMinutes} min to prepare this order. Craves arranges delivery at the earliest available time.`
                          : "This kitchen cooks to order. Craves arranges delivery at the earliest available time."}
                      </p>
                    </div>
                  </div>
                </section>

                {instructions.trim() ? (
                  <section className="rounded-[1.25rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_5px_18px_rgba(26,26,26,0.04)]">
                    <p className="text-xs font-bold text-[#6B6B6B]">Cooking instructions</p>
                    <p className="mt-1.5 text-sm leading-6 text-[#1A1A1A]">{instructions.trim()}</p>
                  </section>
                ) : null}
              </div>

              <aside className="lg:sticky lg:top-24">
                <section className="overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-white shadow-[0_12px_36px_rgba(26,26,26,0.07)]">
                  <div className="border-b border-[#F1F3F5] px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EDF8F0] text-[#16803D]">
                        <ReceiptText className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#F62E18]">
                          Step 3
                        </p>
                        <h2 className="text-base font-bold">Bill details</h2>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                    <div className="mb-4 rounded-[1rem] bg-[#F8F9FA] px-3.5 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">
                        Order summary
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">
                        {items.length} {items.length === 1 ? "item" : "items"} from your selected home kitchen
                      </p>
                    </div>

                    <dl className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-[#6B6B6B]">Item total</dt>
                        <dd className="font-semibold tabular-nums">
                          {money(subtotal, currency)}
                        </dd>
                      </div>

                      {checkout ? (
                        <>
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-[#6B6B6B]">Platform fee</dt>
                            <dd className="font-medium tabular-nums">
                              {money(checkout.platformFee, checkout.currency)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-[#6B6B6B]">Delivery fee</dt>
                            <dd className="font-medium tabular-nums">
                              {money(checkout.deliveryFee, checkout.currency)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-[#6B6B6B]">GST / tax</dt>
                            <dd className="font-medium tabular-nums">
                              {money(checkout.taxAmount, checkout.currency)}
                            </dd>
                          </div>
                          <div className="mt-3 flex items-end justify-between gap-4 border-t border-[#E5E7EB] pt-4">
                            <div>
                              <dt className="text-sm font-black">To pay</dt>
                              <p className="mt-0.5 text-[10px] text-[#6B6B6B]">Inclusive of applicable taxes</p>
                            </div>
                            <dd className="text-xl font-black tabular-nums text-[#1A1A1A]">
                              {money(checkout.grandTotal, checkout.currency)}
                            </dd>
                          </div>
                        </>
                      ) : (
                        <div className="mt-3 flex items-start gap-2 border-t border-[#E5E7EB] pt-4">
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" aria-hidden="true" />
                          <p className="text-xs leading-5 text-[#6B6B6B]">
                            {reviewing
                              ? "Calculating delivery fee, tax and your final total…"
                              : "Your final total is calculated automatically for the selected address."}
                          </p>
                        </div>
                      )}
                    </dl>

                    <div className="mt-4 flex items-start gap-2.5 rounded-[0.9rem] bg-[#EDF8F0] px-3 py-2.5 text-[#176B38]">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p className="text-[11px] font-semibold leading-5">
                        Secure payment. Your order is placed only after Craves confirms payment.
                      </p>
                    </div>

                    {hasCheckoutContext ? (
                      <CheckoutPaymentButton
                        checkout={checkout}
                        previewAmount={subtotal}
                        currency={currency}
                        disabled={
                          reviewing ||
                          addressChangeBusy ||
                          (!checkout && !selectedAddress)
                        }
                        failure={paymentFailure}
                        ensureCheckout={ensureCheckout}
                        onFailure={setPaymentFailure}
                      />
                    ) : null}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        )}

        {error && hasCheckoutContext ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-[#F62E18]/20 bg-[#F62E18]/5 p-3 text-sm font-medium text-[#C92716]"
          >
            {error}
          </p>
        ) : null}
      </main>

      <AddressEditorFlow
        open={editorOpen}
        initialAddress={null}
        profileDefaults={profileDefaults}
        onClose={() => setEditorOpen(false)}
        onSaved={handleAddressSaved}
      />
    </div>
  );
}
