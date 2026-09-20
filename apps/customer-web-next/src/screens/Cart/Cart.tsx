"use client";

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Clock3, Plus, RefreshCw, Store, Undo2 } from "lucide-react";
import { loadSession } from "@/services/auth/cravesAuth";
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
} from "@/services/api/cravesCart";
import { loadDish } from "@/services/api/dishes";
import { CartHeader } from "@/components/cart/CartHeader";
import { EmptyCartState } from "@/components/cart/EmptyCartState";
import { CartItemList } from "@/components/cart/CartItemList";
import { CartCheckoutBar } from "@/components/cart/CartCheckoutBar";

const CHECKOUT_ID_KEY = "craves.checkout.id";
const CHECKOUT_OPERATION_ID_KEY = "craves.checkout.operationId";
const INSTRUCTIONS_KEY = "craves.checkout.instructions";

export const routeMeta = {
  head: () => ({
    meta: [
      { title: "Your Cart – Craves" },
      { name: "robots", content: "noindex" },
    ],
  }),
};

function CartSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-72 animate-pulse rounded-[14px] bg-[#F1F3F5]" />
      <div className="h-28 animate-pulse rounded-[14px] bg-[#F1F3F5]" />
    </div>
  );
}

function CartPage() {
  const navigate = useNavigate();
  const undoTimerRef = useRef<number | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [leadMinutes, setLeadMinutes] = useState<number | null>(null);
  const [undoItem, setUndoItem] = useState<CartItem | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      await loadCart();
      const nextItems = getCart();
      setItems(nextItems);

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
      setLeadMinutes(minutes.length ? Math.max(...minutes) : null);
    } catch (error) {
      setItems([]);
      setLeadMinutes(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Your cart could not be loaded from Craves.",
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

  function showUndo(item: CartItem) {
    setUndoItem(item);
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    undoTimerRef.current = window.setTimeout(() => {
      setUndoItem(null);
      undoTimerRef.current = null;
    }, 5_000);
  }

  async function removeItem(item: CartItem) {
    setBusyItemId(item.id);
    setMessage("");
    try {
      await removeFromCart(item.id);
      showUndo(item);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The cart item could not be removed.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function changeQuantity(item: CartItem, quantity: number) {
    if (quantity <= 0) {
      await removeItem(item);
      return;
    }
    setBusyItemId(item.id);
    setMessage("");
    try {
      await setQty(item.id, quantity);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The cart quantity could not be updated.",
      );
    } finally {
      setBusyItemId(null);
    }
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

  return (
    <div className="min-h-screen bg-white pb-36 text-[#1A1A1A]">
      <CartHeader onBack={() => navigate({ to: "/home" })} />
      <main className="mx-auto max-w-2xl px-4 pb-8 pt-5 md:px-6 md:pt-7">
        {loading ? (
          <>
            <CartSkeleton />
            <p className="sr-only" role="status">
              Loading your Craves cart
            </p>
          </>
        ) : message && items.length === 0 ? (
          <div className="rounded-[14px] border border-[#F62E18]/20 bg-white p-8 text-center shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
            <AlertTriangle className="mx-auto h-9 w-9 text-[#F62E18]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">Cart unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{message}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[11px] bg-[#F62E18] px-5 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyCartState onBrowseMenu={() => navigate({ to: "/home" })} />
        ) : (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white px-4 shadow-[0_4px_18px_rgba(26,26,26,0.05)]">
              <div className="flex items-center gap-3 border-b border-[#F1F3F5] py-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                  <Store className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-base font-semibold">{kitchenName}</h1>
                  <p className="mt-0.5 text-xs text-[#6B6B6B]">Cooks to order</p>
                </div>
              </div>

              <CartItemList
                items={items}
                busyItemId={busyItemId}
                onRemove={(id) => {
                  const item = items.find((candidate) => candidate.id === id);
                  if (item) void removeItem(item);
                }}
                onSetQty={(id, quantity) => {
                  const item = items.find((candidate) => candidate.id === id);
                  if (item) void changeQuantity(item, quantity);
                }}
              />

              {kitchenId ? (
                <a
                  href={`/kitchen/${kitchenId}`}
                  className="flex min-h-12 items-center gap-2 border-t border-[#F1F3F5] py-3 text-sm font-semibold text-[#F62E18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add more from this kitchen
                </a>
              ) : null}
            </section>

            <section>
              <label htmlFor="cooking-instructions" className="text-sm font-semibold">
                Cooking instructions <span className="font-normal text-[#6B6B6B]">(optional)</span>
              </label>
              <textarea
                id="cooking-instructions"
                value={instructions}
                maxLength={200}
                rows={3}
                onChange={(event) => persistInstructions(event.target.value)}
                placeholder="Any special requests for the chef?"
                className="mt-2 w-full resize-none rounded-[11px] border border-[#E5E7EB] bg-white px-3.5 py-3 text-sm outline-none placeholder:text-[#9A9A9A] focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10"
              />
              <p className="mt-1 text-right text-xs tabular-nums text-[#6B6B6B]">
                {instructions.length}/200
              </p>
            </section>

            <section className="flex items-start gap-3 rounded-[14px] border border-[#F6B545]/35 bg-[#FFF8EC] p-4">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#F6A800]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-[#1A1A1A]">
                  This kitchen cooks your order fresh.
                </p>
                <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
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
            className="mt-4 rounded-[11px] border border-[#F62E18]/20 bg-[#F62E18]/5 p-3 text-sm font-medium text-[#C92716]"
          >
            {message}
          </p>
        ) : null}
      </main>

      {undoItem ? (
        <div className="fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-[11px] bg-[#1A1A1A] px-4 py-3 text-sm text-white shadow-xl">
          <span className="min-w-0 flex-1 truncate">{undoItem.name} removed from cart</span>
          <button
            type="button"
            onClick={() => void undoRemoval()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-semibold text-[#F6B545] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" /> Undo
          </button>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <CartCheckoutBar
          total={subtotal}
          currency={currency}
          itemCount={itemCount}
          disabled={validating || busyItemId !== null}
          onContinue={() => void continueToCheckout()}
        />
      ) : null}
    </div>
  );
}

export default CartPage;
