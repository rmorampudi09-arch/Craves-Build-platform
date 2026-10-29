"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, Clock3, House, Plus, RefreshCw, Undo2 } from "lucide-react";
import { loadSelectedAddress, loadSession, type CravesAddress } from "@/features/auth/api/cravesAuth";
import { CartAddressAvailabilityBanner } from "@/features/home/components/CartAddressAvailabilityBanner";
import {
  deliveryPlaceLabel,
  useCartAddressAvailability,
} from "@/features/home/lib/cart-address-availability";
import {
  addToCart,
  cartCurrency,
  cartTotal,
  getCart,
  loadCart,
  removeFromCart,
  setQty,
  subscribeCart,
  validateCart,
  type CartItem,
} from "@/features/cart/api/cravesCart";
import { loadDish } from "@/features/dish/api/dishes";
import { CartHeader } from "@/features/cart/components/CartHeader";
import { EmptyCartState } from "@/features/cart/components/EmptyCartState";
import { CartItemList } from "@/features/cart/components/CartItemList";
import { CartCheckoutBar } from "@/features/cart/components/CartCheckoutBar";
import type { FoodType } from "@/features/cart/components/CartItemRow";
import { LeafPlate } from "@/features/cart/components/LeafPlate";
import { courseOf } from "@/features/cart/lib/leaf-plate";
import { leafSerif } from "@/shared/fonts/theme-fonts";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { CustomerPageSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { ease } from "@/shared/lib/motion";

const CHECKOUT_ID_KEY = "craves.checkout.id";
const CHECKOUT_OPERATION_ID_KEY = "craves.checkout.operationId";
const INSTRUCTIONS_KEY = "craves.checkout.instructions";
const CART_NOTICE_KEY = "craves.cart.notice";
/** Long enough to read and reach; paused while the snackbar is hovered or focused. */
// Long enough to read and reach Undo; hovering or focusing the snackbar pauses it.
const UNDO_VISIBLE_MS = 10_000;

export const routeMeta = {
  head: () => ({
    meta: [
      { title: "Your Cart – Craves" },
      { name: "robots", content: "noindex" },
    ],
  }),
};

/** What the leaf and the lines need from each dish: its course, its veg mark, where the kitchen is. */
type DishDetail = { category?: string; foodType?: FoodType; areaName?: string; distanceMeters?: number };

async function resolveDishDetails(items: CartItem[]): Promise<{ leadMinutes: number | null; details: Record<string, DishDetail> }> {
  const dishResults = await Promise.allSettled(items.map((item) => loadDish(item.menuItemId)));
  const details: Record<string, DishDetail> = {};
  const minutes: number[] = [];
  dishResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const dish = result.value;
    details[items[index].menuItemId] = {
      category: dish.category,
      foodType: dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG"),
      areaName: dish.areaName,
      distanceMeters: dish.distanceMeters,
    };
    const match = /^(\d+)\s*min$/i.exec(dish.time);
    if (match && Number(match[1]) > 0) minutes.push(Number(match[1]));
  });
  return { leadMinutes: minutes.length ? Math.max(...minutes) : null, details };
}

/** "0.65 km", "12.4 km". */
function kilometres(meters: number): string {
  return `${(meters / 1000).toLocaleString("en-IN", { maximumFractionDigits: meters < 10_000 ? 2 : 1 })} km`;
}

/** "Lakshmi" from "Lakshmi's Kitchen"; otherwise the kitchen. */
function noteFor(kitchenName: string | undefined): string {
  return (kitchenName && /^(.+?)['’]s\b/.exec(kitchenName)?.[1]) || "the kitchen";
}

function CartPage() {
  const navigate = useNavigate();
  const undoTimerRef = useRef<number | null>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  // Keyboard users get focus moved to Undo, since the row they were on just left.
  const keyboardInputRef = useRef(false);
  const undoRemainingRef = useRef(UNDO_VISIBLE_MS);
  const undoStartedAtRef = useRef(0);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [validating, setValidating] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [leadMinutes, setLeadMinutes] = useState<number | null>(null);
  const [dishDetails, setDishDetails] = useState<Record<string, DishDetail>>({});
  const [undoItem, setUndoItem] = useState<CartItem | null>(null);
  // The default delivery address, the one Home browses and checkout starts with.
  const [address, setAddress] = useState<CravesAddress | null>(null);
  const availability = useCartAddressAvailability({ items, address });

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      await loadCart();
      const nextItems = getCart();
      setItems(nextItems);

      const checkoutNotice = window.sessionStorage.getItem(CART_NOTICE_KEY);
      if (checkoutNotice) {
        window.sessionStorage.removeItem(CART_NOTICE_KEY);
        setMessage(checkoutNotice);
      }

      setLoading(false);
      void resolveDishDetails(nextItems)
        .then(({ leadMinutes: minutes, details }) => {
          setLeadMinutes(minutes);
          setDishDetails(details);
        })
        .catch(() => setLeadMinutes(null));
    } catch (error) {
      setItems([]);
      setLeadMinutes(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Your cart didn’t load. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setInstructions(window.sessionStorage.getItem(INSTRUCTIONS_KEY) ?? "");
    void loadSession().then((session) => {
      if (!active) return;
      if (!session) {
        navigate({ to: "/" });
        return;
      }
      void refresh();
      // Without the address the cart just isn't checked: a network problem never blocks it.
      void loadSelectedAddress()
        .then((selected) => {
          if (active) setAddress(selected);
        })
        .catch(() => undefined);
    });
    const unsubscribe = subscribeCart(() => setItems(getCart()));
    return () => {
      active = false;
      unsubscribe();
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, [navigate, refresh]);

  function persistInstructions(value: string) {
    setInstructions(value);
    window.sessionStorage.setItem(INSTRUCTIONS_KEY, value);
  }

  function startUndoTimer(ms: number) {
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    undoRemainingRef.current = ms;
    undoStartedAtRef.current = Date.now();
    undoTimerRef.current = window.setTimeout(() => {
      setUndoItem(null);
      undoTimerRef.current = null;
    }, ms);
  }

  function pauseUndoTimer() {
    if (undoTimerRef.current === null) return;
    window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    undoRemainingRef.current -= Date.now() - undoStartedAtRef.current;
  }

  function resumeUndoTimer() {
    if (undoTimerRef.current !== null || !undoItem) return;
    startUndoTimer(Math.max(undoRemainingRef.current, 2_000));
  }

  function showUndo(item: CartItem) {
    setUndoItem(item);
    startUndoTimer(UNDO_VISIBLE_MS);
    if (keyboardInputRef.current) window.requestAnimationFrame(() => undoButtonRef.current?.focus());
  }

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key === "Enter" || event.key === " ") keyboardInputRef.current = true;
    };
    const pointer = () => {
      keyboardInputRef.current = false;
    };
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
    };
  }, []);

  // The row leaves at once; if Craves refuses, the cart service brings it back.
  function removeItem(item: CartItem) {
    setMessage("");
    showUndo(item);
    removeFromCart(item.id).catch((error: unknown) => {
      setUndoItem((current) => (current?.id === item.id ? null : current));
      setMessage(
        error instanceof Error
          ? error.message
          : "The cart item could not be removed.",
      );
    });
  }

  // Quantities update instantly; quick taps are written to Craves as one change.
  function changeQuantity(item: CartItem, quantity: number) {
    if (quantity <= 0) {
      removeItem(item);
      return;
    }
    setMessage("");
    setQty(item.id, quantity).catch((error: unknown) => {
      setMessage(
        error instanceof Error
          ? error.message
          : "The quantity didn’t change. Check your connection and try again.",
      );
    });
  }

  async function undoRemoval() {
    if (!undoItem) return;
    const removed = undoItem;
    setUndoItem(null);
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setMessage("");
    try {
      await addToCart(
        {
          id: removed.menuItemId,
          name: removed.name,
          chef: removed.chef,
          price: removed.price,
          img: removed.img,
          kitchenId: removed.kitchenId,
        },
        removed.qty,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The item could not be restored.",
      );
    }
  }

  async function continueToCheckout() {
    setValidating(true);
    setMessage("");
    try {
      await validateCart();
      window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
      window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
      navigate({ to: "/checkout" });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your cart could not be validated. Review its items and try again.",
      );
    } finally {
      setValidating(false);
    }
  }

  const subtotal = cartTotal();
  const currency = cartCurrency();
  const itemCount = items.reduce((total, item) => total + item.qty, 0);
  const kitchenName = items[0]?.chef;
  const kitchenId = items[0]?.kitchenId;
  const kitchenDetail = items[0] ? dishDetails[items[0].menuItemId] : undefined;
  const kitchenWhere = [
    kitchenDetail?.areaName,
    kitchenDetail?.distanceMeters != null ? `${kilometres(kitchenDetail.distanceMeters)} away` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const foodTypes = Object.fromEntries(Object.entries(dishDetails).map(([id, detail]) => [id, detail.foodType]));
  const plate = items.map((item) => ({
    key: item.menuItemId,
    course: courseOf(dishDetails[item.menuItemId]?.category),
    img: item.img,
    qty: item.qty,
  }));
  const addressLine = address ? [address.hno, address.street, address.mandal, address.city].filter(Boolean).join(", ") : "";

  if (loading) {
    return <CustomerPageSkeleton variant="cart" label="Loading your Craves cart" />;
  }

  return (
    <div className={`${leafSerif.variable} min-h-screen bg-[#F1F6EC] pb-44 text-[#1C2420]`}>
      <CartHeader onBack={() => navigate({ to: "/home" })} />
      <CartAddressAvailabilityBanner
        className="mx-auto max-w-2xl px-4 md:px-6"
        open={availability.open}
        addressLabel={address ? deliveryPlaceLabel(address) : ""}
        unavailableItems={availability.unavailableItems}
        totalCartItems={items.length}
        busy={availability.busy}
        error={availability.error}
        onResolve={() => void availability.resolve()}
        onChooseAddress={() => navigate({ to: "/addresses" })}
        onClose={availability.dismiss}
      />
      <main className="mx-auto max-w-2xl px-4 pb-8 pt-5 md:px-6 md:pt-7">
        {message && items.length === 0 ? (
          <div className="rounded-[8px] border border-[#E5E7EB] bg-white p-8 text-center shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
            <AlertTriangle className="mx-auto h-9 w-9 text-[#F62E18]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">Cart unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{message}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-[#F62E18] px-5 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyCartState onBrowseMenu={() => navigate({ to: "/home" })} />
        ) : (
          <div className="space-y-5">
            {kitchenName ? (
              (() => {
                const from = (
                  <>
                    <ChefFace size={56} className="bg-[#EAF3E2] text-[#22553A]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-[#1C2420]">From {kitchenName}</span>
                      {kitchenWhere ? <span className="mt-0.5 block truncate text-sm text-[#59645C]">{kitchenWhere}</span> : null}
                    </span>
                    {kitchenId ? <ChevronRight className="h-5 w-5 shrink-0 text-[#22553A]" aria-hidden="true" /> : null}
                  </>
                );
                return kitchenId ? (
                  <Link
                    to="/kitchen/$id"
                    params={{ id: kitchenId }}
                    className="flex min-h-14 items-center gap-3 rounded-2xl transition-opacity duration-(--dur-micro) active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22553A]/40"
                  >
                    {from}
                  </Link>
                ) : (
                  <div className="flex min-h-14 items-center gap-3">{from}</div>
                );
              })()
            ) : null}

            <LeafPlate dishes={plate} />

            <section aria-label="Dishes in your cart" className="rounded-[1.25rem] border border-[#E1EAD8] bg-white px-4">
              <CartItemList
                items={items}
                foodTypes={foodTypes}
                onRemove={(id) => {
                  const item = items.find((candidate) => candidate.id === id);
                  if (item) removeItem(item);
                }}
                onSetQty={(id, quantity) => {
                  const item = items.find((candidate) => candidate.id === id);
                  if (item) changeQuantity(item, quantity);
                }}
              />
              {kitchenId ? (
                <Link
                  to="/kitchen/$id"
                  params={{ id: kitchenId }}
                  className="flex min-h-12 items-center gap-2 border-t border-[#E1EAD8] py-3 text-sm font-semibold text-[#CF1F1A] transition-opacity duration-(--dur-micro) active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22553A]/40"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add more from this kitchen
                </Link>
              ) : null}
            </section>

            <section>
              <label htmlFor="cooking-instructions" className="text-[0.9375rem] font-semibold text-[#1C2420]">
                Add a note for {noteFor(kitchenName)}
              </label>
              <textarea
                id="cooking-instructions"
                value={instructions}
                maxLength={200}
                rows={2}
                onChange={(event) => persistInstructions(event.target.value)}
                placeholder="Less oil, no onions, ring the bell twice"
                className="mt-2 w-full resize-none rounded-[1.25rem] border border-[#C9D9BD] bg-white px-4 py-3 text-base outline-none placeholder:text-[#59645C] focus:border-[#22553A] focus:ring-1 focus:ring-[#22553A]"
              />
              <p className="mt-1 text-right text-xs tabular-nums text-[#59645C]">{instructions.length}/200</p>
            </section>

            {address ? (
              <section aria-labelledby="deliver-to-title">
                <h2 id="deliver-to-title" className="font-[family-name:var(--font-leaf)] text-[1.625rem] leading-tight text-[#22553A]">
                  Deliver to
                </h2>
                <div className="mt-2 flex items-start gap-3 rounded-[1.25rem] border border-[#E1EAD8] bg-white px-4 py-3">
                  <House className="mt-2.5 h-5 w-5 shrink-0 text-[#22553A]" aria-hidden="true" />
                  <p className="min-w-0 flex-1 py-2 text-sm leading-5 text-[#59645C]">
                    <b className="block text-base font-semibold text-[#1C2420]">{address.label || "Delivery address"}</b>
                    {addressLine}
                  </p>
                  <Link to="/addresses" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#CF1F1A]">
                    Change
                  </Link>
                </div>
              </section>
            ) : null}

            <section className="flex items-start gap-3 rounded-[1.25rem] bg-[#EAF3E2] p-4">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#22553A]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-[#1C2420]">
                  This kitchen cooks your order fresh.
                </p>
                <p className="mt-1 text-xs leading-5 text-[#59645C]">
                  {leadMinutes
                    ? `Preparation usually takes about ${leadMinutes} min. Craves will arrange the earliest available delivery after checkout.`
                    : "Craves will use the chef's current preparation time and arrange the earliest available delivery after checkout."}
                </p>
              </div>
            </section>
          </div>
        )}

        {message && items.length > 0 ? (
          <p
            role="alert"
            className="mt-4 rounded-[8px] border border-[#E5E7EB] bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]"
          >
            {message}
          </p>
        ) : null}
      </main>

      {/* The live region stays mounted, so screen readers announce the message when it appears. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl"
      >
        <AnimatePresence>
          {undoItem ? (
            <motion.div
              key="cart-undo"
              initial={{ opacity: 0, transform: "translateY(16px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)", transition: { duration: 0.2, ease: ease.out } }}
              exit={{ opacity: 0, transform: "translateY(16px)", transition: { duration: 0.15, ease: ease.in } }}
              onPointerEnter={pauseUndoTimer}
              onPointerLeave={resumeUndoTimer}
              onFocus={pauseUndoTimer}
              onBlur={resumeUndoTimer}
              className="pointer-events-auto flex items-center gap-3 rounded-[8px] bg-[#1A1A1A] px-4 py-3 text-sm text-white shadow-xl"
            >
              <span className="min-w-0 flex-1 truncate">{undoItem.name} removed from cart</span>
              <button
                ref={undoButtonRef}
                type="button"
                onClick={() => void undoRemoval()}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-lg !border-transparent !bg-transparent px-2 font-bold !text-white !shadow-none transition-[background-color] duration-(--dur-micro) active:!bg-white/15 focus-visible:!outline-2 focus-visible:!outline-white focus-visible:!outline-offset-2"
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" /> Undo
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {!loading && items.length > 0 ? (
        <CartCheckoutBar
          total={subtotal}
          currency={currency}
          itemCount={itemCount}
          disabled={validating}
          onContinue={() => void continueToCheckout()}
        />
      ) : null}
    </div>
  );
}

export default CartPage;
