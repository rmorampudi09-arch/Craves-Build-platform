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
  displayAddressLabel,
  isDeliveryReadyAddress,
  parseCustomerAddresses,
  addressText,
  type CustomerAddress,
} from "@/features/addresses/lib/address-contract";
import {
  parseCheckout,
  type CustomerCheckout,
} from "@/features/checkout/lib/checkout-contract";
import {
  checkoutCartSnapshot,
  parseCheckoutOperationResponse,
} from "@/features/checkout/lib/checkout-operation-contract";
import { loadSession } from "@/features/auth/api/cravesAuth";
import { sessionFetch } from "@/shared/lib/session-fetch";
import {
  cartCurrency,
  cartTotal,
  ensureCheckoutCart,
  getCart,
  loadCart,
  validateCart,
  type CartItem,
} from "@/features/cart/api/cravesCart";
import { loadDish } from "@/features/dish/api/dishes";
import { CheckoutHeader } from "@/features/checkout/components/CheckoutHeader";
import {
  CheckoutPaymentButton,
  type CheckoutPaymentFailure,
} from "@/features/checkout/components/CheckoutPaymentButton";
import { AddressEditorFlow } from "@/features/addresses/components/AddressEditorFlow";
import { useCartAddressAvailability } from "@/features/home/lib/cart-address-availability";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";

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

type CheckoutProblem = { message: string; section?: "address" | "cart" };

function checkoutMessage(error: unknown): string {
  return checkoutProblem(error).message;
}

/** Customer copy for a checkout error, plus the section whose controls fix it. */
export function checkoutProblem(error: unknown): CheckoutProblem {
  if (!(error instanceof Error)) {
    return { message: "We couldn’t prepare checkout right now. Your cart is safe — please try again." };
  }

  const message = error.message.trim();
  const normalized = message.toLowerCase();

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("timeout")
  ) {
    return { message: "Craves is having trouble connecting right now. Your cart is safe — check your connection and try again." };
  }

  if (
    normalized.includes("invalid checkout") ||
    normalized.includes("invalid address response") ||
    normalized.includes("checkout attempt") ||
    normalized.includes("could not be loaded")
  ) {
    return { message: "We couldn’t refresh your checkout details right now. Your cart is safe — please try again." };
  }

  if (
    normalized.includes("authentication") ||
    normalized.includes("session_expired") ||
    normalized.includes("session expired")
  ) {
    return { message: "We’re reconnecting your Craves session. Please try again in a moment." };
  }

  // Known backend sentences become customer copy; anything else falls back so engineer text never shows.
  if (normalized.includes("outside") && normalized.includes("service area")) {
    return { section: "address", message: "We don’t deliver to this address yet. Choose another address above or add a new one." };
  }
  if (normalized.includes("minimum order")) {
    return { section: "cart", message: "This order is below the minimum order value. Add a little more from this kitchen to continue." };
  }
  if (normalized.includes("coordinates are required")) {
    return { section: "address", message: "We couldn’t check delivery for this address. Edit it and re-pin it on the map, or choose another address." };
  }
  if (normalized.includes("inactive or does not belong")) {
    return { section: "address", message: "This address is no longer available. Choose another address above or add a new one." };
  }
  if (normalized.includes("pickup profile is incomplete")) {
    return { message: "This home chef can’t take orders right now. Your cart is saved, so please try again later." };
  }
  if (
    normalized.includes("launch policy") ||
    normalized.includes("temporarily unavailable") ||
    normalized.includes("not configured correctly") ||
    normalized.includes("incomplete response")
  ) {
    return { message: "Ordering is paused for a short while. Your cart is saved, so please try again soon." };
  }
  if (normalized.includes("address is incomplete")) {
    return { section: "address", message: "This address is missing some details. Edit it to add them, or choose another address above." };
  }
  if (normalized.includes("select a saved delivery address") || normalized.includes("select a delivery address")) {
    return { section: "address", message: "Choose a delivery address above to continue." };
  }
  if (normalized.includes("another kitchen")) {
    return { section: "cart", message: "Your cart has dishes from another kitchen. Review your cart, then try again." };
  }
  if (normalized.includes("cart changed") || normalized.includes("cart has changed")) {
    return { section: "cart", message: "Your cart changed while you were checking out. Review it, then try again." };
  }

  // Plain, human backend sentences (e.g. "Please sign in again.") pass through; engineer text never does.
  const technical =
    /configur|validation|response|launch|projection|backend|service|null|undefined|exception|http|uuid|coordinates|policy/i.test(message) ||
    /[A-Z_]{4,}/.test(message);
  if (message && message.length <= 160 && !technical) {
    return { message };
  }

  return { message: "We couldn’t prepare checkout right now. Your cart is safe — please try again." };
}

function responseMessage(body: unknown, fallback: string): string {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : fallback;
}


async function fetchAddresses(): Promise<CustomerAddress[]> {
  const response = await sessionFetch("/api/customer/addresses", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseMessage(raw, "Your saved addresses didn’t load. Check your connection and try again."));
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
    throw new Error(responseMessage(raw, "We couldn’t start checkout. Check your cart for items that are no longer available, then try again."));
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

async function resolveLeadMinutes(items: CartItem[]): Promise<number | null> {
  const dishResults = await Promise.allSettled(
    items.map((item) => loadDish(item.menuItemId)),
  );
  const minutes = dishResults
    .flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      const match = /^(\d+)\s*min$/i.exec(result.value.time);
      return match ? [Number(match[1])] : [];
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  return minutes.length ? Math.max(...minutes) : null;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const prepareStartedRef = useRef(false);
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
  const [addressChangeBusy, setAddressChangeBusy] = useState(false);
  // While Razorpay is open or a payment is being confirmed, a new address would start a second checkout.
  const [paymentLocked, setPaymentLocked] = useState(false);
  const [error, setError] = useState("");

  const prepareCheckout = useCallback(async () => {
    setLoading(true);
    setError("");
    let leaving = false;
    const openPaidOrder = (restored: CustomerCheckout | null) => {
      const orderId = restored?.status === "PAID" ? restored.orders[0]?.id : undefined;
      if (!orderId) return false;
      leaving = true;
      for (const key of [CHECKOUT_ID_KEY, CHECKOUT_OPERATION_ID_KEY, INSTRUCTIONS_KEY]) {
        window.sessionStorage.removeItem(key);
      }
      navigate({ to: `/orders/${orderId}`, replace: true });
      return true;
    };
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
          if (openPaidOrder(restored)) return;
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
            if (openPaidOrder(restored)) return;
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

      setItems(nextItems);
      setSelectedId(preferred?.id ?? "");
      setCheckout(null);
      setLoading(false);
      void resolveLeadMinutes(nextItems)
        .then(setLeadMinutes)
        .catch(() => setLeadMinutes(null));
    } catch (caught) {
      setItems([]);
      setAddresses([]);
      setSelectedId("");
      setLeadMinutes(null);
      setError(checkoutMessage(caught));
    } finally {
      // Keep the skeleton while a paid order opens instead of flashing checkout.
      if (!leaving) setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (prepareStartedRef.current) return;
    prepareStartedRef.current = true;
    void prepareCheckout();
  }, [prepareCheckout]);

  async function resetCheckoutForAddressChange(): Promise<boolean> {
    if (!checkout) return true;

    try {
      const restored = await ensureCheckoutCart(checkout.orders);
      if (!restored) return false;

      setItems(getCart());
      window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
      window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
      setCheckout(null);
      return true;
    } catch {
      // Keep the existing checkout untouched if the cart cannot be rebuilt.
      // The customer can still pay with the current address or go back.
      return false;
    }
  }

  async function selectAddress(id: string) {
    if (addressChangeBusy || paymentLocked || (id === selectedId && checkout)) return;

    setAddressChangeBusy(true);
    setError("");
    try {
      const readyForAddressChange = await resetCheckoutForAddressChange();
      if (!readyForAddressChange) {
        setError(
          "We couldn’t refresh delivery for that address just now. Your current checkout is unchanged — you can try again or return to your cart.",
        );
        return;
      }

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

  function openAddressEditor() {
    if (addressChangeBusy || paymentLocked) return;

    // Opening the editor is safe and should never be blocked by a checkout
    // restoration attempt. We only rebuild the cart if the customer actually
    // selects a different saved address.
    setError("");
    setEditorOpen(true);
  }

  // Review total: the checkout (an unpaid order, which empties the server cart) is created on that tap only,
  // never on page load or an address change, like the Android app.
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

  const selectedAddress = addresses.find((address) => address.id === selectedId);
  const { unavailableItems } = useCartAddressAvailability({
    items,
    address: selectedAddress
      ? { id: selectedAddress.id, lat: selectedAddress.latitude, lng: selectedAddress.longitude }
      : null,
  });
  // Pay waits only when nothing in the order can reach this address; changing it stays open.
  const noItemReachesAddress = items.length > 0 && unavailableItems.length === items.length;

  async function handleBackToCart() {
    // While a payment opens or is being confirmed, Back keeps the customer here with its message.
    if (paymentLocked) return;
    setError("");

    const currentCheckout = checkout;
    window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
    window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
    setCheckout(null);

    if (!currentCheckout) {
      navigate({ to: "/cart" });
      return;
    }

    // Never trap the customer on checkout. Give cart restoration a short head
    // start, then return to the cart even if the network is slow. The shared
    // cart store keeps updating if restoration finishes after navigation.
    let finished = false;
    const restoration = ensureCheckoutCart(currentCheckout.orders)
      .then((restored) => {
        finished = true;
        if (!restored) {
          window.sessionStorage.setItem(
            CART_NOTICE_KEY,
            "Your cart is open. Please check the items before continuing to checkout again.",
          );
        }
      })
      .catch(() => {
        finished = true;
        window.sessionStorage.setItem(
          CART_NOTICE_KEY,
          "Your cart is open. We couldn’t refresh every item automatically, so please check it before continuing.",
        );
      });

    await Promise.race([
      restoration,
      new Promise<void>((resolve) => window.setTimeout(resolve, 900)),
    ]);

    navigate({ to: "/cart" });

    if (!finished) {
      void restoration;
    }
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
  const visibleAddresses = showAllAddresses ? addresses : addresses.slice(0, 3);
  const hasCheckoutContext = items.length > 0 || checkout !== null;
  const addressProblem =
    error || (paymentFailure?.section === "address" ? paymentFailure.message : "");
  const cartProblem = paymentFailure?.section === "cart" ? paymentFailure.message : "";

  return (
    <div className="min-h-screen bg-[#F7F7F7] pb-36 text-[#1A1A1A] lg:pb-12">
      <CheckoutHeader
        onBack={() => void handleBackToCart()}
        title="Checkout"
        subtitle="Choose delivery, then pay securely"
      />

      <main className="mx-auto max-w-[1180px] px-4 py-5 md:px-6 md:py-8 lg:px-8 lg:py-9">
        {loading ? (
          <CustomerSectionSkeleton variant="checkout" label="Preparing your checkout" />
        ) : error && !hasCheckoutContext ? (
          <section className="rounded-[1.25rem] border border-[#E5E7EB] bg-white p-8 text-center shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
            <AlertTriangle className="mx-auto h-9 w-9 text-[#C4200F]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">We couldn’t prepare checkout</h2>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{error}</p>
            <button
              type="button"
              onClick={() => void prepareCheckout()}
              className="craves-primary-action mt-6"
            >
              <RefreshCw className="h-5 w-5" aria-hidden="true" /> Try again
            </button>
          </section>
        ) : (
          <div>
            <div className="mb-6 hidden lg:block">
              <div className="flex items-end justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-black tracking-[-0.04em] text-[#1A1A1A]">
                    Delivery & payment
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6B6B6B]">
                    Choose where to deliver, then review your total before you pay.
                  </p>
                </div>
                <span className="rounded-full border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#6B6B6B] shadow-[0_2px_8px_rgba(26,26,26,0.04)]">
                  {items.length} {items.length === 1 ? "item" : "items"} in this order
                </span>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-7 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="space-y-4">
                <section className="overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-white shadow-[0_8px_28px_rgba(26,26,26,0.055)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[#F1F3F5] px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]">
                        <MapPin className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <h2 className="text-base font-bold">Delivery address</h2>
                    </div>
                    <button
                      type="button"
                      onClick={openAddressEditor}
                      disabled={addressChangeBusy || paymentLocked}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-[#D7DADF] bg-white px-3 text-xs font-bold text-[#1A1A1A] shadow-[0_1px_2px_rgba(26,26,26,0.06)] transition hover:!bg-[#F1F3F5] disabled:pointer-events-none disabled:opacity-45"
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
                              "relative flex min-h-[116px] cursor-pointer items-start gap-3 rounded-[1rem] border p-3.5 transition-[border-color,background-color,box-shadow]",
                              // Selected: a 2px Flame Red edge (inset, so nothing shifts), no red tint.
                              checked
                                ? "border-[#F62E18] bg-white shadow-[inset_0_0_0_1px_#F62E18]"
                                : "border-[#E5E7EB] bg-white hover:border-[#6B6B6B]",
                            ].join(" ")}
                          >
                            <input
                              type="radio"
                              name="delivery-address"
                              value={address.id}
                              checked={checked}
                              disabled={addressChangeBusy || paymentLocked}
                              onChange={() => void selectAddress(address.id)}
                              className="mt-1 h-4 w-4 shrink-0 accent-[#F62E18] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold capitalize">
                                  {displayAddressLabel(address.addressLabel)}
                                </span>
                                {address.isDefault ? (
                                  <span className="rounded-full bg-[#F1F3F5] px-2 py-0.5 text-[11px] font-bold text-[#1A1A1A]">
                                    Default
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-1.5 block text-xs leading-5 text-[#6B6B6B]">
                                {addressText(address)}
                              </span>
                            </span>
                          </label>
                        );
                      })}

                      {addresses.length > 3 ? (
                        <button
                          type="button"
                          onClick={() => setShowAllAddresses((current) => !current)}
                          className="min-h-11 rounded-[1rem] border border-dashed border-[#D7DADF] !bg-[#F1F3F5] px-4 text-sm font-bold text-[#1A1A1A] !shadow-none transition hover:!bg-white sm:col-span-2 lg:col-span-1 xl:col-span-2"
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
                        onClick={openAddressEditor}
                        disabled={addressChangeBusy || paymentLocked}
                        className="craves-primary-action mt-4"
                      >
                        <Plus className="h-5 w-5" aria-hidden="true" />
                        Add a new address
                      </button>
                    </div>
                  )}

                  {paymentLocked ? (
                    <p className="mx-3 mb-3 px-1 text-xs leading-5 text-[#6B6B6B] sm:mx-4 sm:mb-4">
                      The address stays as it is while your payment goes through.
                    </p>
                  ) : null}

                  {/* Always mounted, so a notice that arrives after the check is read out. */}
                  <div aria-live="polite">
                    {unavailableItems.length > 0 ? (
                      <div className="mx-3 mb-3 flex items-start gap-2.5 rounded-[1rem] bg-[#F1F3F5] p-3 text-sm leading-5 text-[#1A1A1A] sm:mx-4 sm:mb-4">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#C4200F]" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {noItemReachesAddress
                              ? "Your order can’t be delivered to this address"
                              : "Some dishes can’t be delivered to this address"}
                          </p>
                          <p className="mt-0.5">
                            Not available here: {unavailableItems.map((item) => `${item.name} × ${item.qty}`).join(", ")}.{" "}
                            {noItemReachesAddress
                              ? "Choose another address to pay, or add a new one."
                              : "Remove them from your cart, or choose another address."}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {addressProblem ? (
                    <p
                      role="alert"
                      className="mx-3 mb-3 flex items-start gap-2.5 rounded-[1rem] bg-[#F1F3F5] p-3 text-sm leading-5 text-[#1A1A1A] sm:mx-4 sm:mb-4"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#C4200F]" aria-hidden="true" />
                      {addressProblem}
                    </p>
                  ) : null}
                </section>

                <section className="rounded-[1.45rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_28px_rgba(26,26,26,0.05)] sm:p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]">
                      <Clock3 className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h2 className="text-base font-bold">Delivery timing</h2>
                  </div>
                  <div className="mt-4 rounded-[1rem] bg-[#F1F3F5] p-4">
                    <div>
                      <p className="text-xs font-semibold text-[#6B6B6B]">Earliest delivery</p>
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
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]">
                        <ReceiptText className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <h2 className="text-base font-bold">Bill details</h2>
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                    <div className="mb-4 rounded-[1rem] bg-[#F1F3F5] px-3.5 py-3">
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
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
                          <p className="text-xs leading-5 text-[#6B6B6B]">
                            Tap Review total to see the delivery fee, tax and your final total.
                          </p>
                        </div>
                      )}
                    </dl>

                    {cartProblem ? (
                      <div
                        role="alert"
                        className="mt-4 rounded-[0.9rem] bg-[#F1F3F5] p-3 text-sm leading-5 text-[#1A1A1A]"
                      >
                        <p className="flex items-start gap-2.5">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#C4200F]" aria-hidden="true" />
                          {cartProblem}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleBackToCart()}
                          className="mt-2 min-h-11 rounded-full !border-0 !bg-white px-4 text-sm font-bold !text-[#1A1A1A] !shadow-none"
                        >
                          Review cart
                        </button>
                      </div>
                    ) : null}

                    <div className="mt-4 flex items-start gap-2.5 rounded-[0.9rem] bg-[#F1F3F5] px-3 py-2.5 text-[#1A1A1A]">
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
                          addressChangeBusy ||
                          noItemReachesAddress ||
                          (!checkout && !selectedAddress)
                        }
                        failure={paymentFailure}
                        ensureCheckout={() =>
                          ensureCheckout().catch((caught) =>
                            setPaymentFailure({ ...checkoutProblem(caught), retryAllowed: true }),
                          )
                        }
                        onFailure={setPaymentFailure}
                        onPaymentLockChange={setPaymentLocked}
                        onReviewCart={() => void handleBackToCart()}
                      />
                    ) : null}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        )}

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
