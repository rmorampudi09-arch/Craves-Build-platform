"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FaArrowLeft,
  FaArrowRight,
  FaArrowRotateRight,
  FaBagShopping,
  FaCircleExclamation,
} from "react-icons/fa6";
import {
  formatOrderStatus,
  parseCustomerOrders,
  type CustomerOrder,
} from "@/lib/order-contract";
import { shortOrderNumber } from "@/lib/order-number";
import { loadSession } from "@/services/auth/cravesAuth";
import { addToCart, CartKeptError, loadCart } from "@/services/api/cravesCart";
import { loadKitchenMenu } from "@/services/api/dishes";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";
import { useReturnScroll } from "@/lib/return-scroll";

// Read and cleared by the cart page, which shows it once (same key as checkout uses).
const CART_NOTICE_KEY = "craves.cart.notice";
const dishList = new Intl.ListFormat("en-IN", { type: "conjunction" });

const ACTIVE_STATUSES = new Set([
  "PAYMENT_PENDING",
  "PAID",
  "CHEF_ACCEPTANCE_PENDING",
  "CHEF_ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "REFUND_PENDING",
]);

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** "Sat, 10 Oct · 12:42 pm": the day first, so past orders are easy to tell apart; the year only when it isn't this one. */
export function formatOrderDate(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  const time = date
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
  return `${day} · ${time}`;
}

function itemSummary(order: CustomerOrder): string {
  if (order.items.length === 0) return "Order items unavailable";
  return order.items.map((item) => `${item.quantity} × ${item.itemName}`).join(", ");
}

function statusClass(status: string): string {
  if (
    status === "CHEF_REJECTED" ||
    status === "CANCELLED" ||
    status === "REFUND_FAILED"
  ) {
    return "bg-[#F1F3F5] text-[#C4200F]";
  }
  if (status.startsWith("REFUND")) {
    return "bg-[#F1F3F5] text-[#6B6B6B]";
  }
  return "bg-[#F1F3F5] text-[#1A1A1A]";
}

/**
 * Puts a delivered order's dishes back in the cart with the existing cart
 * functions (which ask before replacing another kitchen's cart). Returns a
 * note for the cart page about dishes that are no longer on the menu.
 */
export async function reorderIntoCart(order: CustomerOrder): Promise<{ added: number; note: string }> {
  // Start from the cart Craves holds now: a paid order may have used the one this page last saw.
  await loadCart();
  const menu = new Map((await loadKitchenMenu(order.kitchenId)).map((dish) => [dish.id, dish]));
  const unavailable: string[] = [];
  let added = 0;
  for (const item of order.items) {
    const dish = menu.get(item.menuItemId);
    if (!dish) {
      unavailable.push(item.itemName);
      continue;
    }
    await addToCart(
      { id: dish.id, name: dish.name, chef: dish.chef, price: dish.price, img: dish.img, kitchenId: order.kitchenId },
      Math.min(item.quantity, 50),
    );
    added += 1;
  }
  const note = unavailable.length
    ? `${dishList.format(unavailable)} ${unavailable.length === 1 ? "isn’t" : "aren’t"} available right now, so we added the rest of your order.`
    : "";
  return { added, note };
}

function CutleryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="3.5" y="2.25" width="1.6" height="5.6" rx="0.8" />
      <rect x="6.2" y="2.25" width="1.6" height="5.6" rx="0.8" />
      <rect x="8.9" y="2.25" width="1.6" height="5.6" rx="0.8" />
      <path d="M3.5 6.6h7v1.55a3.5 3.5 0 0 1-2.65 3.4V21a.85.85 0 0 1-1.7 0v-9.45A3.5 3.5 0 0 1 3.5 8.15V6.6Z" />
      <path d="M16.8 2.25c-2.05 0-3.7 1.85-3.7 4.15 0 1.9 1.12 3.5 2.85 4v10.55a.85.85 0 0 0 1.7 0V10.4c1.73-.5 2.85-2.1 2.85-4 0-2.3-1.65-4.15-3.7-4.15Z" />
    </svg>
  );
}

function OrderSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-40 animate-pulse rounded-2xl border border-[#E5E7EB] bg-[#F1F3F5]"
        />
      ))}
    </div>
  );
}

export default function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [reorder, setReorder] = useState<{ orderId: string; busy: boolean; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const rememberScroll = useReturnScroll(!loading);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
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
            : "Your orders didn’t load. Check your connection and try again.";
        throw new Error(message);
      }
      const parsed = parseCustomerOrders(raw);
      if (!parsed) throw new Error("Craves returned an invalid orders response.");
      setOrders(
        [...parsed].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
      );
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your orders didn’t load. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadSession().then((session) => {
      if (!active) return;
      if (!session) {
        navigate({ to: "/" });
        return;
      }
      void load();
    });
    return () => {
      active = false;
    };
  }, [load, navigate]);

  // Orders that are still on their way come first, then everything else.
  const sections = useMemo(
    () =>
      [
        { title: "In progress", orders: orders.filter((order) => ACTIVE_STATUSES.has(order.status)) },
        { title: "Past orders", orders: orders.filter((order) => !ACTIVE_STATUSES.has(order.status)) },
      ].filter((section) => section.orders.length > 0),
    [orders],
  );

  async function orderAgain(order: CustomerOrder) {
    if (reorder?.busy) return;
    setReorder({ orderId: order.id, busy: true, message: "" });
    try {
      const { added, note } = await reorderIntoCart(order);
      if (added === 0) {
        setReorder({ orderId: order.id, busy: false, message: "None of these dishes are available right now." });
        return;
      }
      if (note) window.sessionStorage.setItem(CART_NOTICE_KEY, note);
      navigate({ to: "/cart" });
    } catch (error) {
      // "Keep current cart" was the customer's choice: nothing to report.
      setReorder(
        error instanceof CartKeptError
          ? null
          : {
              orderId: order.id,
              busy: false,
              message:
                error instanceof Error && error.message
                  ? error.message
                  : "We couldn’t add these dishes to your cart. Please try again.",
            },
      );
    }
  }

  return (
    <div className="min-h-screen bg-white pb-20 text-ink" onClickCapture={rememberScroll}>
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 md:px-6 md:py-5">
          <Link
            to="/profile"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full !bg-white !text-[#1A1A1A] transition-colors hover:!bg-[#F1F3F5]"
            aria-label="Back to profile"
          >
            <FaArrowLeft className="text-lg" aria-hidden="true" />
          </Link>

          <Link
            to="/home"
            className="shrink-0 rounded-lg"
            aria-label="Craves home"
          >
            <CravesLogo size="sm" decorative />
          </Link>

          <div className="min-w-0">
            <h1 className="mt-0.5 text-xl font-semibold leading-tight text-[#1A1A1A]">
              Your orders
            </h1>
          </div>

          <button
            type="button"
            disabled={refreshing || loading}
            onClick={() => void load(true)}
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full !border-0 !bg-[#F1F3F5] !text-[#1A1A1A] !shadow-none disabled:opacity-50"
            aria-label="Refresh orders"
          >
            <FaArrowRotateRight
              className={`text-sm ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
          {lastUpdatedAt && (
            <span className="sr-only">
              Last refreshed {lastUpdatedAt.toLocaleTimeString("en-IN")}
            </span>
          )}
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-4xl px-4 pb-8 pt-4 md:px-6 md:pb-10 md:pt-5">
        <section aria-live="polite">
          {loading ? (
            <>
              <OrderSkeleton />
              <p className="sr-only" role="status">
                Loading your orders
              </p>
            </>
          ) : error && orders.length === 0 ? (
            <div className="rounded-2xl border border-[#D8DADD] bg-white p-8 text-center shadow-[0_3px_10px_rgba(0,0,0,0.07)] md:p-10">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#C4200F]">
                <FaCircleExclamation className="text-xl" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-[#1A1A1A]">
                Orders unavailable
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
                {error}
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="craves-primary-action mt-6"
              >
                <FaArrowRotateRight className="text-base" aria-hidden="true" />
                Try again
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-[#D8DADD] bg-white p-8 text-center shadow-[0_3px_10px_rgba(0,0,0,0.07)] md:p-10">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                <FaBagShopping className="text-xl" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-[#1A1A1A]">
                No orders yet
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
                Your first Craves order will appear here after checkout.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: "/home" })}
                className="craves-primary-action mt-6"
              >
                Browse food
                <FaArrowRight className="text-sm" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="space-y-7">
              {sections.map((section) => (
                <section key={section.title} aria-label={section.title}>
                  <h2 className="mb-3 text-sm font-semibold text-[#1A1A1A]">
                    {section.title} ({section.orders.length})
                  </h2>
                  <ul className="space-y-3">
                    {section.orders.map((order) => {
                      const active = ACTIVE_STATUSES.has(order.status);
                      const reordering = reorder?.orderId === order.id ? reorder : null;
                      return (
                        <li
                          key={order.id}
                          className="relative rounded-2xl border border-[#D8DADD] bg-white p-4 shadow-[0_3px_10px_rgba(0,0,0,0.07)] transition-[border-color,box-shadow] duration-200 hover:border-[#C9CCD0] hover:shadow-[0_4px_14px_rgba(0,0,0,0.09)] md:p-5"
                        >
                          <div className="flex items-start gap-3.5">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]">
                              <CutleryIcon />
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="truncate text-base font-semibold text-[#1A1A1A]">
                                    {/* The whole card opens the order; its ::after covers the card. */}
                                    <Link
                                      to={active ? `/orders/${order.id}/tracking` : `/orders/${order.id}`}
                                      aria-label={`${active ? "Track order" : "View order"} from ${order.kitchenName}`}
                                      className="after:absolute after:inset-0 after:rounded-2xl"
                                    >
                                      {order.kitchenName}
                                    </Link>
                                  </h3>
                                  {/* Date and order number on their own lines on phones, one line from 640 px. */}
                                  <p className="mt-1 text-[13px] text-[#6B6B6B]">
                                    <time dateTime={order.createdAt} className="block sm:inline">
                                      {formatOrderDate(order.createdAt)}
                                    </time>
                                    <span className="hidden sm:inline"> · </span>
                                    <span className="block sm:inline">Order #{shortOrderNumber(order.id)}</span>
                                  </p>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-4 ${statusClass(order.status)}`}
                                >
                                  {formatOrderStatus(order.status)}
                                </span>
                              </div>

                              <p className="mt-2 truncate text-[13px] font-medium text-[#1A1A1A]">
                                {itemSummary(order)}
                              </p>

                              <div className="mt-3 flex min-h-11 items-center justify-between gap-4 border-t border-[#E5E7EB] pt-3">
                                <p className="text-sm font-semibold text-[#1A1A1A]">
                                  {money(order.grandTotal, order.currency)}
                                  <span className="font-normal text-[#6B6B6B]"> total paid</span>
                                </p>
                                {order.status === "DELIVERED" ? (
                                  <button
                                    type="button"
                                    disabled={reorder?.busy}
                                    aria-busy={reordering?.busy}
                                    onClick={() => void orderAgain(order)}
                                    className="relative z-10 min-h-11 shrink-0 rounded-full !border-0 !bg-[#F1F3F5] px-4 text-sm font-bold !text-[#1A1A1A] !shadow-none"
                                  >
                                    {reordering?.busy ? "Adding…" : "Order again"}
                                  </button>
                                ) : null}
                              </div>
                              {reordering?.message ? (
                                <p role="status" className="relative z-10 mt-2 text-sm font-medium text-[#C4200F]">
                                  {reordering.message}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {error && orders.length > 0 && (
            <p
              role="alert"
              className="mt-5 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]"
            >
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
