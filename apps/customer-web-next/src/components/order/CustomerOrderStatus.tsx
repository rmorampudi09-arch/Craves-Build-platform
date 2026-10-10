"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, Clock3, MapPin, RefreshCw } from "lucide-react";
import {
  formatOrderStatus,
  parseCustomerOrder,
  type CustomerOrder,
} from "@/lib/order-contract";
import { shortOrderNumber } from "@/lib/order-number";

interface TimelineStep {
  key: string;
  label: string;
  done: boolean;
  active: boolean;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return "₹" + Math.round(amount);
  }
}

function addressLine(order: CustomerOrder): string {
  const address = order.deliveryAddress;
  if (!address) return "Your saved delivery address";
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

const ORDER_STAGE: Record<string, number> = {
  PAYMENT_PENDING: 0,
  PAID: 1,
  CHEF_ACCEPTANCE_PENDING: 1,
  CHEF_ACCEPTED: 2,
  PREPARING: 3,
  READY_FOR_PICKUP: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
};

function timeline(order: CustomerOrder): TimelineStep[] {
  const stage = ORDER_STAGE[order.status] ?? 0;
  return [
    {
      key: "payment",
      label: "Payment received",
      done: stage >= 1,
      active: stage === 1,
    },
    {
      key: "accepted",
      label: "Accepted by " + order.kitchenName,
      done: stage >= 2,
      active: stage === 2,
    },
    {
      key: "cooking",
      label: "Cooking your order",
      done: stage >= 3,
      active: stage === 3,
    },
    {
      key: "delivery",
      label: "Out for delivery",
      done: stage >= 4,
      active: stage === 4,
    },
    {
      key: "delivered",
      label: "Delivered",
      done: stage >= 5,
      active: stage === 5,
    },
  ];
}

function headline(order: CustomerOrder): string {
  const itemName =
    order.items.length === 1 ? order.items[0]?.itemName : "order";
  if (order.status === "PAYMENT_PENDING") return "Payment is being confirmed";
  if (order.status === "PAID" || order.status === "CHEF_ACCEPTANCE_PENDING") {
    return order.kitchenName + " has your order";
  }
  if (order.status === "CHEF_ACCEPTED" || order.status === "PREPARING") {
    return order.kitchenName + " is starting your " + itemName;
  }
  if (order.status === "READY_FOR_PICKUP") {
    return "Your food is ready for pickup";
  }
  if (order.status === "OUT_FOR_DELIVERY") {
    return "Your order is on the way";
  }
  if (order.status === "DELIVERED") return "Your order has arrived";
  return formatOrderStatus(order.status);
}

/** Drawn once when the order is placed; static for reduced motion. */
function PlacedTick() {
  const reduceMotion = useReducedMotion();
  return (
    <svg viewBox="0 0 64 64" className="mx-auto h-16 w-16" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#F62E18" />
      <motion.path
        d="M19 33.5l8.5 8.5L45.5 23"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

function responseMessage(value: unknown, fallback: string): string {
  return value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : fallback;
}

export function CustomerOrderStatus({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const refreshingRef = useRef(false);

  const refresh = useCallback(
    async (background = false) => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      if (background) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const response = await fetch(
          "/api/orders/" + encodeURIComponent(orderId),
          {
            cache: "no-store",
            credentials: "same-origin",
          },
        );
        const raw = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(responseMessage(raw, "We couldn’t load this order. Please try again."));
        }
        const parsed = parseCustomerOrder(raw);
        if (!parsed || parsed.id.toLowerCase() !== orderId.toLowerCase()) {
          throw new Error("We couldn’t load this order. Please try again.");
        }
        setOrder(parsed);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "We couldn’t load this order. Please try again.",
        );
      } finally {
        refreshingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orderId],
  );

  useEffect(() => {
    let cancelled = false;
    void refresh();

    const timer = window.setInterval(() => {
      if (!cancelled && document.visibilityState === "visible") {
        void refresh(true);
      }
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refresh]);

  if (loading && !order) {
    return (
      <div className="min-h-screen bg-white px-4 py-8">
        <div className="mx-auto max-w-md space-y-4" aria-hidden="true">
          <div className="h-48 animate-pulse rounded-[14px] bg-[#F1F3F5]" />
          <div className="h-28 animate-pulse rounded-[14px] bg-[#F1F3F5]" />
          <div className="h-72 animate-pulse rounded-[14px] bg-[#F1F3F5]" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-white px-4 py-10 text-[#1A1A1A]">
        <section className="mx-auto max-w-md rounded-[14px] border border-[#E5E7EB] bg-white p-8 text-center shadow-[0_4px_18px_rgba(26,26,26,0.06)]">
          <AlertTriangle className="mx-auto h-9 w-9 text-[#C4200F]" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">Order status unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">
            {error || "We couldn’t load this order. Please try again."}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="craves-primary-action mt-5"
          >
            <RefreshCw className="h-5 w-5" aria-hidden="true" /> Try again
          </button>
        </section>
      </div>
    );
  }

  const rejected =
    order.status === "CHEF_REJECTED" ||
    order.status === "CANCELLED" ||
    order.status.startsWith("REFUND");
  const steps = timeline(order);
  const updatedAt = new Date(order.updatedAt);
  const awaitingPayment = order.status === "PAYMENT_PENDING";

  return (
    <div className="min-h-screen bg-white pb-28 text-[#1A1A1A]">
      <main className="mx-auto max-w-md px-4 pb-8 pt-8">
        <div className="text-center">
          {rejected || awaitingPayment ? (
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]">
              {rejected ? (
                <AlertTriangle className="h-7 w-7" aria-hidden="true" />
              ) : (
                <Clock3 className="h-7 w-7" aria-hidden="true" />
              )}
            </span>
          ) : (
            <PlacedTick />
          )}
          <h1 className="mt-5 text-[24px] font-semibold leading-8 tracking-[-0.025em]">
            {headline(order)}
          </h1>
          <p className="mt-1 text-sm font-medium text-[#6B6B6B]">
            Order #{shortOrderNumber(order.id)}
          </p>
          {awaitingPayment ? (
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">
              Craves is waiting for payment confirmation.
            </p>
          ) : null}
        </div>

        <section
          aria-label="Your order"
          className="mt-6 rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_4px_18px_rgba(26,26,26,0.05)]"
        >
          <ul className="space-y-2 text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-semibold tabular-nums">{item.quantity} ×</span>{" "}
                  {item.itemName}
                </span>
                <span className="shrink-0 tabular-nums text-[#6B6B6B]">
                  {money(item.lineTotal, order.currency)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center justify-between gap-3 border-t border-[#E5E7EB] pt-3 text-sm font-semibold">
            <span>{awaitingPayment ? "Total" : "Total paid"}</span>
            <span className="tabular-nums">{money(order.grandTotal, order.currency)}</span>
          </p>
        </section>

        {rejected ? (
          <section className="mt-6 rounded-[14px] border border-[#E5E7EB] bg-white p-4">
            <p className="text-sm font-semibold text-[#C4200F]">
              {formatOrderStatus(order.status)}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#1A1A1A]">
              Check your order history for the latest payment or refund status.
            </p>
          </section>
        ) : null}

        <section className="mt-6 rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_4px_18px_rgba(26,26,26,0.05)]">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Delivery address</p>
              <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                {addressLine(order)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[14px] border border-[#E5E7EB] bg-white p-5 shadow-[0_4px_18px_rgba(26,26,26,0.05)]">
          <ol className="relative space-y-6 pl-10">
            <span
              className="absolute left-[13px] top-3 h-[calc(100%-24px)] w-px bg-[#E5E7EB]"
              aria-hidden="true"
            />
            {steps.map((step) => {
              const markerClass = step.done
                ? "border-[#F62E18] bg-[#F62E18] text-white"
                : step.active
                  ? "border-[#F62E18] bg-white text-[#F62E18]"
                  : "border-[#D7DADF] bg-[#F1F3F5] text-[#A2A6AA]";
              const labelClass =
                step.done || step.active
                  ? "text-[#1A1A1A]"
                  : "text-[#8B8F93]";
              return (
                <li key={step.key} className="relative">
                  <span
                    className={
                      "absolute -left-10 flex h-7 w-7 items-center justify-center rounded-full border " +
                      markerClass
                    }
                  >
                    {step.done ? (
                      <Check
                        className="h-3.5 w-3.5"
                        strokeWidth={3}
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className="h-2 w-2 rounded-full bg-current"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <p className={"text-sm font-semibold " + labelClass}>
                    {step.label}
                  </p>
                  {step.active ? (
                    <p className="mt-1 text-xs text-[#6B6B6B]">
                      Updated{" "}
                      {updatedAt.toLocaleTimeString("en-IN", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>

        <p className="mt-4 text-center text-[11px] text-[#8B8F93]">
          {refreshing
            ? "Checking for an update…"
            : "Order status refreshes every 15 seconds."}
        </p>
      </main>

      {/* Sits above the mobile tab bar (4.7rem incl. safe area) instead of under it. */}
      <div className="fixed inset-x-0 bottom-[calc(4.7rem+env(safe-area-inset-bottom))] z-30 border-t border-[#E5E7EB] bg-white md:bottom-0">
        <div className="mx-auto max-w-md px-4 py-3 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Link
            href={"/orders/" + order.id + "/tracking"}
            className="craves-primary-action w-full"
          >
            Track order
          </Link>
        </div>
      </div>
    </div>
  );
}
