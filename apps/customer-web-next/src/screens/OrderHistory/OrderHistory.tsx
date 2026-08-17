"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FaArrowLeft,
  FaArrowRight,
  FaArrowRotateRight,
  FaBagShopping,
  FaChevronRight,
  FaCircleExclamation,
  FaReceipt,
} from "react-icons/fa6";
import {
  formatOrderStatus,
  parseCustomerOrders,
  type CustomerOrder,
} from "@/lib/order-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { CravesLogo } from "@/components/brand/CravesLogo";

type OrderView = "ACTIVE" | "PAST" | "ALL";

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
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatOrderDate(value: string): string {
  const date = new Date(value);
  const datePart = date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timePart = date
    .toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());

  return `${datePart} • ${timePart}`;
}

function itemSummary(order: CustomerOrder): string {
  if (order.items.length === 0) return "Order items unavailable";
  return order.items
    .map((item) => `${item.itemName} x ${item.quantity}`)
    .join(", ");
}

function statusClass(status: string): string {
  if (status === "DELIVERED" || status === "PAID") {
    return "bg-[#F1F3F5] text-[#247A3D]";
  }
  if (
    status === "CHEF_REJECTED" ||
    status === "CANCELLED" ||
    status === "REFUND_FAILED"
  ) {
    return "bg-[#F1F3F5] text-[#C92716]";
  }
  if (status.startsWith("REFUND")) {
    return "bg-[#F1F3F5] text-[#6B6B6B]";
  }
  return "bg-[#F1F3F5] text-[#F62E18]";
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
  const [view, setView] = useState<OrderView>("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

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
            : "Your orders could not be loaded.";
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
          : "Your orders could not be loaded.",
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

  const counts = useMemo(
    () => ({
      ACTIVE: orders.filter((order) => ACTIVE_STATUSES.has(order.status)).length,
      PAST: orders.filter((order) => !ACTIVE_STATUSES.has(order.status)).length,
      ALL: orders.length,
    }),
    [orders],
  );

  const visibleOrders = useMemo(() => {
    if (view === "ALL") return orders;
    return orders.filter((order) =>
      view === "ACTIVE"
        ? ACTIVE_STATUSES.has(order.status)
        : !ACTIVE_STATUSES.has(order.status),
    );
  }, [orders, view]);

  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <header className="border-b border-[#E5E7EB] bg-white">
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1A1A1A]">
              Craves account
            </p>
            <h1 className="mt-0.5 text-xl font-semibold leading-tight text-[#1A1A1A]">
              My Orders
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-8 pt-4 md:px-6 md:pb-10 md:pt-5">
        <div className="flex min-h-10 items-center justify-between gap-4">
          <p className="text-sm text-[#6B6B6B]">
            Your recent orders will appear here.
          </p>
          <button
            type="button"
            disabled={refreshing || loading}
            onClick={() => void load(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18] transition-colors hover:bg-[#E5E7EB] disabled:opacity-50"
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

        <nav
          className="mt-4 flex gap-7 border-b border-[#E5E7EB] sm:gap-9"
          aria-label="Filter orders"
        >
          {(["ACTIVE", "PAST", "ALL"] as const).map((nextView) => {
            const selected = view === nextView;
            const label =
              nextView === "ACTIVE"
                ? "Active"
                : nextView === "PAST"
                  ? "Past"
                  : "All";

            return (
              <button
                key={nextView}
                type="button"
                onClick={() => setView(nextView)}
                aria-pressed={selected}
                className={`relative min-h-11 pb-2 text-sm font-semibold transition-colors ${
                  selected
                    ? "text-[#F62E18] after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-[#F62E18]"
                    : "text-[#1A1A1A] hover:text-[#F62E18]"
                }`}
              >
                {label} ({counts[nextView]})
              </button>
            );
          })}
        </nav>

        <section className="mt-5" aria-live="polite">
          {loading ? (
            <>
              <OrderSkeleton />
              <p className="sr-only" role="status">
                Loading your orders
              </p>
            </>
          ) : error && orders.length === 0 ? (
            <div className="rounded-2xl border border-[#D8DADD] bg-white p-8 text-center shadow-[0_3px_10px_rgba(0,0,0,0.07)] md:p-10">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
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
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F62E18] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                <FaArrowRotateRight className="text-sm" aria-hidden="true" />
                Retry
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
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F62E18] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Browse food
                <FaArrowRight className="text-sm" aria-hidden="true" />
              </button>
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="rounded-2xl border border-[#D8DADD] bg-white p-8 text-center shadow-[0_3px_10px_rgba(0,0,0,0.05)]">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                <FaReceipt className="text-xl" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-[#1A1A1A]">
                No {view === "ACTIVE" ? "active" : "past"} orders
              </h2>
              <p className="mt-2 text-sm text-[#6B6B6B]">
                Choose another filter to view your remaining orders.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleOrders.map((order) => (
                <Link
                  key={order.id}
                  to="/tracking"
                  search={{ id: order.id }}
                  aria-label={`Track order from ${order.kitchenName}`}
                  className="group relative block rounded-2xl border border-[#D8DADD] bg-white p-4 pr-11 shadow-[0_3px_10px_rgba(0,0,0,0.07)] transition-[border-color,box-shadow] duration-200 hover:border-[#C9CCD0] hover:shadow-[0_4px_14px_rgba(0,0,0,0.09)] md:p-5 md:pr-12"
                >
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                      <CutleryIcon />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-semibold text-[#1A1A1A]">
                            {order.kitchenName}
                          </h2>
                          <p className="mt-1 text-[13px] font-medium text-[#1A1A1A]">
                            Order #{order.id.slice(-8).toUpperCase()}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-4 ${statusClass(order.status)}`}
                        >
                          {formatOrderStatus(order.status)}
                        </span>
                      </div>

                      <p className="mt-1 text-[13px] text-[#6B6B6B]">
                        {formatOrderDate(order.createdAt)}
                      </p>

                      <div className="mt-3 flex items-end justify-between gap-4 border-t border-[#E5E7EB] pt-3">
                        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#1A1A1A]">
                          {itemSummary(order)}
                        </p>
                        <p className="shrink-0 text-sm font-semibold text-[#1A1A1A]">
                          Total Paid: {money(order.grandTotal, order.currency)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <FaChevronRight
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#1A1A1A] transition-transform group-hover:translate-x-0.5 md:right-5"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          )}

          {error && orders.length > 0 && (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-[#F62E18]/20 bg-white p-3 text-sm font-medium text-[#C92716]"
            >
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
