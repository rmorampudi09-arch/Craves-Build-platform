"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Clock3,
  LifeBuoy,
  MapPin,
  RefreshCw,
  Store,
} from "lucide-react";
import { TrackingHeader } from "@/components/tracking/TrackingHeader";
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

/** Exact money: whole rupees stay whole, paise are never rounded away. */
function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return "₹" + amount.toFixed(2);
  }
}

const clock = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const dayAndTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** "1:34 pm" today, "8 Oct, 1:34 pm" otherwise. */
function when(value: string): string {
  const date = new Date(value);
  return (date.toDateString() === new Date().toDateString() ? clock : dayAndTime).format(date);
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
  PREPARING: 2,
  READY_FOR_PICKUP: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
};

/** Done steps are ticked; the one in progress is the next step not yet done. */
function timeline(order: CustomerOrder): TimelineStep[] {
  const stage = ORDER_STAGE[order.status] ?? 0;
  const kitchen = order.kitchenName;
  const steps = [
    { key: "payment", done: "Payment received", next: "Confirming your payment" },
    { key: "accepted", done: `Accepted by ${kitchen}`, next: `Waiting for ${kitchen} to accept` },
    { key: "cooking", done: "Cooked and packed", next: "Cooking your order" },
    { key: "delivery", done: "Picked up for delivery", next: "Waiting for pickup" },
    { key: "delivered", done: "Delivered", next: "On the way to you" },
  ];
  return steps.map((step, index) => {
    const done = stage > index;
    const active = !done && stage === index;
    return { key: step.key, label: done ? step.done : step.next, done, active };
  });
}

type Tone = "placed" | "waiting" | "problem";

function summary(order: CustomerOrder): { title: string; next: string; tone: Tone } {
  const kitchen = order.kitchenName;
  switch (order.status) {
    case "PAYMENT_PENDING":
      return {
        title: "Confirming your payment",
        next: "Razorpay is confirming the payment. This page updates by itself, so there’s no need to pay again.",
        tone: "waiting",
      };
    case "PAID":
    case "CHEF_ACCEPTANCE_PENDING":
      return {
        title: "Order placed",
        next: `${kitchen} is reviewing your order. Their cooking time shows here once they accept.`,
        tone: "placed",
      };
    case "CHEF_ACCEPTED":
    case "PREPARING":
      return {
        title: `${kitchen} is cooking`,
        next: order.prepTimeMinutes
          ? `Ready in about ${order.prepTimeMinutes} min, then it’s on its way to you.`
          : "Your food is being cooked fresh. It goes out for delivery as soon as it’s packed.",
        tone: "placed",
      };
    case "READY_FOR_PICKUP":
      return {
        title: "Packed and ready",
        next: "A delivery partner is picking it up from the kitchen.",
        tone: "placed",
      };
    case "OUT_FOR_DELIVERY":
      return {
        title: "On the way",
        next: "Your order has left the kitchen. Track it for live delivery updates.",
        tone: "placed",
      };
    case "DELIVERED":
      return { title: "Delivered", next: `Enjoy your meal from ${kitchen}.`, tone: "placed" };
    case "CHEF_REJECTED":
      return {
        title: `${kitchen} couldn’t take this order`,
        next: "Craves refunds this order to your original payment method. The refund shows here as it moves.",
        tone: "problem",
      };
    case "REFUND_PENDING":
      return {
        title: "Refund in progress",
        next: "Your refund has been sent to your original payment method. Banks can take a few working days to show it.",
        tone: "problem",
      };
    case "REFUNDED":
      return {
        title: "Refunded",
        next: "The amount has been returned to your original payment method.",
        tone: "problem",
      };
    case "REFUND_FAILED":
      return {
        title: "Refund delayed",
        next: "Craves is retrying your refund. Get help below if it doesn’t arrive.",
        tone: "problem",
      };
    case "CANCELLED":
      return {
        title: "Order cancelled",
        next: "This order was cancelled. Any amount paid is refunded to your original payment method.",
        tone: "problem",
      };
    default:
      return { title: formatOrderStatus(order.status), next: "", tone: "waiting" };
  }
}

/** Drawn once when the order is placed; static for reduced motion. */
function PlacedTick() {
  const reduceMotion = useReducedMotion();
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14 shrink-0" aria-hidden="true">
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

const CARD = "rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_3px_10px_rgba(26,26,26,0.04)]";
const UNAVAILABLE = "We couldn’t load this order. Check your connection and try again.";

/**
 * Where checkout lands after a successful payment, and the order's page from Your orders:
 * what happened, what happens next, the bill and the ways forward (track, get help, orders).
 */
export function CustomerOrderStatus({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const refreshingRef = useRef(false);

  const refresh = useCallback(
    async (background = false) => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      if (background) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/orders/" + encodeURIComponent(orderId), {
          cache: "no-store",
          credentials: "same-origin",
        });
        const raw = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(responseMessage(raw, UNAVAILABLE));
        }
        const parsed = parseCustomerOrder(raw);
        if (!parsed || parsed.id.toLowerCase() !== orderId.toLowerCase()) {
          throw new Error(UNAVAILABLE);
        }
        setOrder(parsed);
        setCheckedAt(new Date());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : UNAVAILABLE);
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

  const header = (
    <TrackingHeader
      title="Order status"
      orderId={shortOrderNumber(orderId)}
      onBack={() => router.push("/orders")}
      onRefresh={() => void refresh(true)}
      refreshing={refreshing || (loading && !order)}
    />
  );

  if (loading && !order) {
    return (
      <div className="min-h-screen bg-white">
        {header}
        <p className="sr-only" role="status">
          Loading your order
        </p>
        <div
          className="mx-auto grid max-w-5xl gap-5 px-4 py-5 md:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
          aria-hidden="true"
        >
          <div className="space-y-5">
            <div className="h-44 animate-pulse rounded-2xl bg-[#F1F3F5]" />
            <div className="h-72 animate-pulse rounded-2xl bg-[#F1F3F5]" />
          </div>
          <div className="h-80 animate-pulse rounded-2xl bg-[#F1F3F5]" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-white text-[#1A1A1A]">
        {header}
        <main className="mx-auto max-w-md px-4 py-10">
          <section className={`${CARD} p-8 text-center`}>
            <AlertTriangle className="mx-auto h-9 w-9 text-[#C4200F]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">This order didn’t load</h2>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{error || UNAVAILABLE}</p>
            <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
              Your order and payment are safe. Only this page failed to load.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => void refresh()} className="craves-primary-action">
                <RefreshCw className="h-5 w-5" aria-hidden="true" /> Try again
              </button>
              <Link
                href="/orders"
                className="inline-flex min-h-12 items-center rounded-full bg-[#F1F3F5] px-6 text-base font-bold text-[#1A1A1A]"
              >
                Your orders
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const status = summary(order);
  const steps = timeline(order);
  const delivered = order.status === "DELIVERED";
  const problem = status.tone === "problem";
  const awaitingPayment = order.status === "PAYMENT_PENDING";
  const trackable = !problem && !delivered;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const bill: [string, number][] = [
    ["Item total", order.foodSubtotal],
    ["Platform fee", order.platformFee],
    ["Taxes", order.taxAmount],
    ["Delivery fee", order.deliveryFee],
  ];

  return (
    <div className="min-h-screen bg-white pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-[#1A1A1A] md:pb-12">
      {header}

      <main className="mx-auto max-w-5xl px-4 py-5 md:px-6 md:py-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-5">
            {/* What happened and what happens next, with the way forward right under it. */}
            <section className={`${CARD} p-5 md:p-6`} aria-labelledby="order-status-title">
              <div className="flex items-start gap-4">
                {status.tone === "placed" ? (
                  <PlacedTick />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]">
                    {problem ? (
                      <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    ) : (
                      <Clock3 className="h-6 w-6" aria-hidden="true" />
                    )}
                  </span>
                )}
                <div className="min-w-0">
                  <h2
                    id="order-status-title"
                    className="font-display text-2xl font-bold leading-tight tracking-[-0.03em]"
                  >
                    {status.title}
                  </h2>
                  {status.next ? (
                    <p className="mt-1.5 text-[0.9375rem] leading-6 text-[#4A4A4A]">{status.next}</p>
                  ) : null}
                  <p className="mt-2 text-sm text-[#6B6B6B]">
                    Order #{shortOrderNumber(order.id)} · Placed {when(order.createdAt)}
                  </p>
                </div>
              </div>

              {order.chefResponseNote ? (
                <figure className="mt-4 rounded-xl bg-[#F1F3F5] px-4 py-3">
                  <blockquote className="text-[0.9375rem] leading-6">“{order.chefResponseNote}”</blockquote>
                  <figcaption className="mt-1 text-xs font-semibold text-[#6B6B6B]">
                    {order.kitchenName}
                  </figcaption>
                </figure>
              ) : null}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <Link
                  href={`/support?orderId=${order.id}`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-[0.9375rem] font-bold text-[#1A1A1A] hover:bg-[#F1F3F5]"
                >
                  <LifeBuoy className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                  Get help
                </Link>
                {trackable ? (
                  <Link href={`/orders/${order.id}/tracking`} className="craves-primary-action !min-h-12 !px-4">
                    Track order
                  </Link>
                ) : delivered ? (
                  <Link href={`/kitchen/${order.kitchenId}`} className="craves-primary-action !min-h-12 !px-4">
                    Order again
                  </Link>
                ) : (
                  <Link href="/home" className="craves-primary-action !min-h-12 !px-4">
                    Browse dishes
                  </Link>
                )}
              </div>
            </section>

            <section className={`${CARD} p-5 md:p-6`} aria-labelledby="order-progress-title">
              <h2 id="order-progress-title" className="text-base font-semibold">
                Progress
              </h2>
              {problem ? (
                <p className="mt-2 text-sm leading-6 text-[#4A4A4A]">
                  {formatOrderStatus(order.status)} · updated {when(order.updatedAt)}
                </p>
              ) : (
                <ol className="relative mt-4 space-y-5 pl-10">
                  <span
                    className="absolute left-[13px] top-3 h-[calc(100%-24px)] w-px bg-[#E5E7EB]"
                    aria-hidden="true"
                  />
                  {steps.map((step) => (
                    <li
                      key={step.key}
                      className="relative"
                      aria-current={step.active ? "step" : undefined}
                    >
                      <span
                        className={[
                          "absolute -left-10 flex h-7 w-7 items-center justify-center rounded-full border",
                          step.done
                            ? "border-[#F62E18] bg-[#F62E18] text-white"
                            : step.active
                              ? "border-[#F62E18] bg-white text-[#F62E18]"
                              : "border-[#D7DADF] bg-[#F1F3F5] text-[#A2A6AA]",
                        ].join(" ")}
                      >
                        {step.done ? (
                          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                        ) : (
                          <span className="relative flex h-2 w-2" aria-hidden="true">
                            {/* The step in progress breathes; reduced motion holds it still. */}
                            {step.active ? (
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" />
                            ) : null}
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
                          </span>
                        )}
                      </span>
                      <p
                        className={`text-sm font-semibold ${step.done || step.active ? "text-[#1A1A1A]" : "text-[#8B8F93]"}`}
                      >
                        {step.label}
                        {step.active ? <span className="sr-only"> (in progress)</span> : null}
                      </p>
                      {step.active ? (
                        <p className="mt-0.5 text-xs text-[#6B6B6B]">Now · updated {when(order.updatedAt)}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-5 text-xs text-[#6B6B6B]" role="status">
                {refreshing
                  ? "Checking for an update…"
                  : `Updates every 15 seconds${checkedAt ? ` · last checked ${clock.format(checkedAt)}` : ""}`}
              </p>
            </section>
          </div>

          <div className="space-y-5">
            <section className={`${CARD} p-5`} aria-labelledby="order-bill-title">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                  <Store className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id="order-bill-title" className="truncate text-base font-semibold">
                    {order.kitchenName}
                  </h2>
                  <p className="text-xs text-[#6B6B6B]">
                    {itemCount} {itemCount === 1 ? "item" : "items"}
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-semibold tabular-nums">{item.quantity} ×</span> {item.itemName}
                    </span>
                    <span className="shrink-0 tabular-nums">{money(item.lineTotal, order.currency)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 space-y-1.5 border-t border-[#E5E7EB] pt-4 text-sm text-[#4A4A4A]">
                {bill.map(([label, amount]) =>
                  amount > 0 || label === "Item total" ? (
                    <div key={label} className="flex justify-between gap-3">
                      <dt>{label}</dt>
                      <dd className="tabular-nums">{money(amount, order.currency)}</dd>
                    </div>
                  ) : null,
                )}
                <div className="flex justify-between gap-3 border-t border-[#E5E7EB] pt-3 text-base font-bold text-[#1A1A1A]">
                  <dt>{awaitingPayment ? "To pay" : "Total paid"}</dt>
                  <dd className="tabular-nums">{money(order.grandTotal, order.currency)}</dd>
                </div>
              </dl>
            </section>

            <section className={`${CARD} p-5`} aria-labelledby="order-address-title">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id="order-address-title" className="text-base font-semibold">
                    Delivering to {order.deliveryAddress?.recipientName ?? "you"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">{addressLine(order)}</p>
                </div>
              </div>
            </section>

            <nav aria-label="More from this order" className="flex flex-wrap gap-3">
              <Link
                href="/orders"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#F1F3F5] px-5 text-sm font-bold text-[#1A1A1A]"
              >
                Your orders
              </Link>
              <Link
                href="/home"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#F1F3F5] px-5 text-sm font-bold text-[#1A1A1A]"
              >
                Continue browsing
              </Link>
            </nav>
          </div>
        </div>
      </main>
    </div>
  );
}
