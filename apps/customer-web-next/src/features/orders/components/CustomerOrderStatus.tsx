"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ChevronRight, Clock3, LifeBuoy, MapPin, RefreshCw, Wallet } from "lucide-react";
import { TrackingHeader } from "@/features/orders/components/TrackingHeader";
import { KitchenSteps, OrderMap } from "@/features/orders/components/OrderMap";
import { OrderCalendar } from "@/features/orders/components/OrderCalendar";
import { OrderReviewCard } from "@/features/orders/components/OrderReviewCard";
import { PaidParcel } from "@/features/orders/components/PaidParcel";
import {
  isAbandonedUnpaidOrder,
  parseCustomerOrder,
  type CustomerOrder,
} from "@/features/orders/lib/order-contract";
import {
  parseDeliveryStatusResponse,
  type DeliveryStatusResponse,
} from "@/features/orders/lib/delivery-status";
import { orderCalendar } from "@/features/orders/lib/order-calendar";
import { homePin, orderJourney, tracksDelivery, type OrderJourney } from "@/features/orders/lib/order-journey";
import { paymentStatus, TONE_TEXT } from "@/features/orders/lib/order-presentation";
import { useDishPhotos } from "@/features/orders/api/dish-photos";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { calendarCondensed } from "@/shared/fonts/theme-fonts";
import { paidParcelDue } from "@/shared/lib/paid-parcel";
import { useKitchenProfile } from "@/shared/hooks/use-kitchen-profile";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { returnToListPath } from "@/shared/lib/return-scroll";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";

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

// The server stores snacks as "Snakes"; people read "Snacks".
function categoryLabel(category: string): string {
  return category === "Snakes" ? "Snacks" : category;
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

/** Nothing changes after these, so the page stops checking. A rejected order still moves on to its refund. */
const FINAL_STATUSES = new Set(["DELIVERED", "CANCELLED", "REFUNDED"]);

// Web-only states: an unpaid order nobody came back to, and the landing right after checkout verified a payment.
const ABANDONED: OrderJourney = {
  kind: "CLOSED",
  title: "Payment not completed",
  detail: "This order wasn’t paid, so it wasn’t sent to the kitchen. If money left your account, contact support with this order number.",
};
const CONFIRMING: OrderJourney = {
  kind: "KITCHEN",
  step: -1,
  title: "Confirming your payment",
  detail: "Razorpay is confirming the payment. This page updates by itself, so there’s no need to pay again.",
};

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
/** Like the app: the order, and its delivery once it is ready, every 30 seconds. */
const POLL_MS = 30_000;

/** The latest delivery update; null when there is none or it didn't load, so the map keeps what it had. */
async function readDelivery(orderId: string): Promise<DeliveryStatusResponse | null> {
  try {
    const response = await sessionFetch(`/api/orders/${encodeURIComponent(orderId)}/delivery-status`, { cache: "no-store" });
    if (!response.ok) return null;
    const parsed = parseDeliveryStatusResponse(await response.json());
    return parsed.orderId.toLowerCase() === orderId.toLowerCase() ? parsed : null;
  } catch {
    return null;
  }
}

function DishPhoto({ url }: { url: string | undefined }) {
  return (
    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#F1F3F5]" aria-hidden="true">
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
    </span>
  );
}

/**
 * Where checkout lands after a successful payment, and the order's page from Your orders:
 * what happened, the map (blurred with the kitchen steps until pickup, live after), the bill and
 * the ways forward (continue payment, track, rate, get help). `paymentStep` is checkout's own
 * payment step, shown while the order is unpaid. `justPaid` marks checkout's landing after a verified payment,
 * which the order can trail while the payment is confirmed.
 */
export function CustomerOrderStatus({
  orderId,
  justPaid = false,
  paymentStep: PaymentStep,
}: {
  orderId: string;
  justPaid?: boolean;
  /** `onSettled` reloads the order once a payment attempt ends, paid or not. */
  paymentStep?: ComponentType<{ order: CustomerOrder; onSettled: () => void }>;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [delivery, setDelivery] = useState<DeliveryStatusResponse | null>(null);
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
        const response = await sessionFetch("/api/orders/" + encodeURIComponent(orderId), { cache: "no-store" });
        const raw = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(responseMessage(raw, UNAVAILABLE));
        }
        const parsed = parseCustomerOrder(raw);
        if (!parsed || parsed.id.toLowerCase() !== orderId.toLowerCase()) {
          throw new Error(UNAVAILABLE);
        }
        if (tracksDelivery(parsed.status)) {
          const next = await readDelivery(orderId);
          if (next) setDelivery(next);
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

  // Its age is measured when it was fetched, so a render never changes the answer.
  const abandoned = order !== null && checkedAt !== null && isAbandonedUnpaidOrder(order, checkedAt.getTime());
  const settled = order !== null && (abandoned || FINAL_STATUSES.has(order.status));

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (settled) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, settled]);

  const { profile: kitchen } = useKitchenProfile(order?.kitchenId);
  const photos = useDishPhotos(order?.kitchenId);
  // The cart's leaf folds into a parcel only after this tab's checkout verified the payment with Razorpay (never for a
  // typed ?paid=1, a failed or a closed payment), once, and never with reduced motion. The tab's mark is read after
  // mount (the server can't see it), before the first paint.
  const reduceMotion = useReducedMotion();
  const [parcelDue, setParcelDue] = useState(false);
  useLayoutEffect(() => {
    setParcelDue(paidParcelDue(orderId));
  }, [orderId]);
  const endParcel = useCallback(() => setParcelDue(false), []);

  const header = (
    <TrackingHeader
      title="Order details"
      orderNumber={shortOrderNumber(orderId)}
      onBack={() => router.push(returnToListPath() ?? "/orders")}
      onRefresh={() => void refresh(true)}
      refreshing={refreshing || (loading && !order)}
    />
  );

  if (loading && !order) {
    return (
      <div className={`${calendarCondensed.variable} min-h-screen bg-white`}>
        {/* Right after paying, the parcel's white cover is up at once, so no skeleton flashes before the leaf. */}
        {parcelDue && !reduceMotion ? <div aria-hidden="true" className="fixed inset-0 z-[90] bg-white" /> : null}
        {header}
        <main className="mx-auto max-w-5xl px-4 py-5 md:px-6 md:py-6">
          <CustomerSectionSkeleton variant="order" label="Loading your order" />
        </main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className={`${calendarCondensed.variable} min-h-screen bg-white text-[#1A1A1A]`}>
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

  const unpaid = order.status === "PAYMENT_PENDING";
  const journey = abandoned ? ABANDONED : unpaid && justPaid ? CONFIRMING : orderJourney(order, delivery?.status ?? null);
  const home = homePin(order);
  const delivered = order.status === "DELIVERED";
  const problem = journey.kind === "CLOSED";
  const awaitingPayment = unpaid && !abandoned && !justPaid;
  const trackable = !problem && !delivered;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const payment = paymentStatus(order.status, { abandoned, confirming: unpaid && justPaid });
  // A paid order on its way shows as the Kitchen Calendar's day sheet; unpaid and closed orders keep their card.
  const sheet = orderCalendar(order, delivery) !== null;
  const bill: [string, number][] = [
    ["Item total", order.foodSubtotal],
    ["Platform fee", order.platformFee],
    ["Taxes", order.taxAmount],
    ["Delivery fee", order.deliveryFee],
  ];

  return (
    <div
      className={`${calendarCondensed.variable} min-h-screen ${sheet ? "bg-[#FFFEFA]" : "bg-white"} pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-[#1A1A1A] md:pb-12`}
    >
      {parcelDue && !reduceMotion && !problem ? (
        <PaidParcel order={order} amount={money(order.grandTotal, order.currency)} photos={photos} onDone={endParcel} />
      ) : null}
      {header}

      <main className="mx-auto max-w-5xl px-4 py-5 md:px-6 md:py-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-5">
            {/* What happened and what happens next, with the way forward right under it. */}
            <section
              className={sheet ? undefined : `${CARD} p-5 md:p-6`}
              aria-labelledby={sheet ? undefined : "order-status-title"}
            >
              {sheet ? (
                <OrderCalendar order={order} delivery={delivery} now={checkedAt ?? new Date()} title={journey.title} />
              ) : (
                <div className="flex items-start gap-4">
                  {!problem && !unpaid ? (
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
                      {journey.title}
                    </h2>
                    {journey.detail ? (
                      <p className="mt-1.5 text-[0.9375rem] leading-6 text-[#4A4A4A]">{journey.detail}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-[#6B6B6B]">
                      Order #{shortOrderNumber(order.id)} · Placed {when(order.createdAt)}
                    </p>
                  </div>
                </div>
              )}

              {order.chefResponseNote ? (
                <figure className="mt-4 rounded-xl bg-[#F1F3F5] px-4 py-3">
                  <figcaption className="text-xs font-semibold text-[#6B6B6B]">Note from the chef</figcaption>
                  <blockquote className="mt-1 text-[0.9375rem] leading-6">“{order.chefResponseNote}”</blockquote>
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
              <p className="mt-4 text-xs text-[#6B6B6B]" role="status">
                {refreshing
                  ? "Checking for an update…"
                  : settled && checkedAt
                    ? `Last checked ${clock.format(checkedAt)}`
                    : `Updates every 30 seconds${checkedAt ? ` · last checked ${clock.format(checkedAt)}` : ""}`}
              </p>
            </section>

            {delivered ? <OrderReviewCard orderId={order.id} /> : null}

            {/* The day sheet already lists the kitchen steps, so the blurred map under them only shows without it. */}
            {journey.kind === "KITCHEN" && !sheet ? (
              <OrderMap
                home={home}
                courier={null}
                blurred
                label="Map, hidden until your order is picked up"
                className="h-[248px] rounded-2xl"
              >
                <KitchenSteps step={journey.step} />
              </OrderMap>
            ) : journey.kind === "DELIVERY" ? (
              <Link
                href={`/orders/${order.id}/tracking`}
                aria-label={journey.delivered ? "Delivery history" : "Track live: open the delivery map"}
                className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A]"
              >
                <OrderMap
                  home={home}
                  courier={delivery?.courierLocation ?? null}
                  blurred={false}
                  label="Delivery map"
                  className="h-[280px] rounded-2xl"
                >
                  <span className="pointer-events-none absolute bottom-3 left-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-white pl-3 pr-2 text-[0.9375rem] font-semibold text-[#1A1A1A] shadow-[0_3px_10px_rgba(26,26,26,0.12)]">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      {journey.delivered ? null : (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1F9D55] opacity-60 motion-reduce:animate-none" />
                      )}
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${journey.delivered ? "bg-[#6B6B6B]" : "bg-[#1F9D55]"}`} />
                    </span>
                    {journey.delivered ? "Delivery history" : "Track live"}
                    <ChevronRight className="h-[18px] w-[18px] text-[#6B6B6B]" aria-hidden="true" />
                  </span>
                </OrderMap>
              </Link>
            ) : null}
          </div>

          <div className="space-y-5">
            <section className={`${CARD} p-5`} aria-labelledby="order-bill-title">
              <div className="flex items-center gap-3">
                <ChefFace photoUrl={kitchen?.chefPhotoUrl} name={kitchen?.displayName ?? order.kitchenName} size={44} />
                <div className="min-w-0">
                  <h2 id="order-bill-title" className="truncate text-base font-semibold">
                    {order.kitchenName}
                  </h2>
                  <p className="text-xs text-[#6B6B6B]">
                    {itemCount} {itemCount === 1 ? "item" : "items"}
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-3 text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <DishPhoto url={photos.get(item.menuItemId)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{item.itemName}</span>
                      {/* Like the app: "2 × ₹120 · Main course". */}
                      <span className="block text-[0.8125rem] tabular-nums text-[#6B6B6B]">
                        {item.quantity} × {money(item.unitPrice, order.currency)} · {categoryLabel(item.category)}
                      </span>
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
                  <dt>{abandoned ? "Order total" : awaitingPayment ? "To pay" : "Total paid"}</dt>
                  <dd className="tabular-nums">{money(order.grandTotal, order.currency)}</dd>
                </div>
              </dl>
            </section>

            {awaitingPayment && PaymentStep ? <PaymentStep order={order} onSettled={() => void refresh(true)} /> : null}

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
              {payment ? (
                <div className="mt-4 flex items-start gap-3 border-t border-[#E5E7EB] pt-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                    <Wallet className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold">Payment</h3>
                    <p className={`mt-1 text-sm font-semibold ${TONE_TEXT[payment.tone]}`}>{payment.label}</p>
                  </div>
                </div>
              ) : null}
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
