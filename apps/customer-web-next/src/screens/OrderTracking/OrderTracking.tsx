"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { FaArrowLeft, FaArrowsRotate } from "react-icons/fa6";
import {
  formatOrderStatus,
  parseCustomerOrder,
  type CustomerOrder,
} from "@/lib/order-contract";
import {
  parseDeliveryStatusResponse,
  presentationFor,
  shouldAutoRefresh,
  type DeliveryStatusResponse,
} from "@/lib/delivery-status";
import { loadSession } from "@/services/auth/cravesAuth";
import { trackingPresentation } from "@/lib/tracking-presentation";
import { shortOrderNumber } from "@/lib/order-number";
import { TrackingHeader } from "@/components/tracking/TrackingHeader";
import { CurrentStatusCard } from "@/components/tracking/CurrentStatusCard";
import { OrderTimeline } from "@/components/tracking/OrderTimeline";
import { DeliveryAddressCard } from "@/components/tracking/DeliveryAddressCard";
import { TrackingOrderSummaryCard } from "@/components/tracking/TrackingOrderSummaryCard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNAVAILABLE = "We couldn’t load tracking for this order. Please try again.";
const clockTime = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const dayAndTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** "9:41 pm" today, "8 Oct, 9:41 pm" otherwise. */
function updateTime(value: string): string {
  const date = new Date(value);
  return (date.toDateString() === new Date().toDateString() ? clockTime : dayAndTime).format(date);
}

function responseMessage(value: unknown, fallback: string): string {
  return value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : fallback;
}

export default function TrackingPage({ orderId: id }: { orderId: string }) {
  const navigate = useNavigate();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [delivery, setDelivery] = useState<DeliveryStatusResponse | null>(null);
  const deliveryRef = useRef<DeliveryStatusResponse | null>(null);
  const refreshingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(
    async (orderId: string, background = false) => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      if (background) setBusy(true);
      else setLoading(true);
      setError("");
      try {
        const [orderResponse, deliveryResponse] = await Promise.all([
          fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
            cache: "no-store",
            credentials: "same-origin",
          }),
          fetch(`/api/orders/${encodeURIComponent(orderId)}/delivery-status`, {
            cache: "no-store",
            credentials: "same-origin",
          }),
        ]);

        const orderRaw = await orderResponse.json().catch(() => null);
        if (!orderResponse.ok) {
          throw new Error(responseMessage(orderRaw, UNAVAILABLE));
        }
        const parsedOrder = parseCustomerOrder(orderRaw);
        if (!parsedOrder || parsedOrder.id.toLowerCase() !== orderId.toLowerCase()) {
          throw new Error(UNAVAILABLE);
        }
        setOrder(parsedOrder);

        if (deliveryResponse.ok) {
          const deliveryRaw = await deliveryResponse.json().catch(() => null);
          const parsedDelivery = parseDeliveryStatusResponse(deliveryRaw);
          if (parsedDelivery.orderId.toLowerCase() !== orderId.toLowerCase()) {
            throw new Error(UNAVAILABLE);
          }
          deliveryRef.current = parsedDelivery;
          setDelivery(parsedDelivery);
          setMessage(
            parsedDelivery.status
              ? "Your delivery status is up to date."
              : "Delivery updates will appear here once a delivery partner picks up your order.",
          );
        } else {
          const deliveryRaw = await deliveryResponse.json().catch(() => null);
          deliveryRef.current = null;
          setDelivery(null);
          setMessage(
            deliveryResponse.status === 404
              ? "Delivery updates will appear here once a delivery partner picks up your order."
              : responseMessage(
                  deliveryRaw,
                  "Delivery updates are taking a break. Your order status above is still current.",
                ),
          );
        }
        setLastUpdatedAt(new Date());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : UNAVAILABLE);
      } finally {
        refreshingRef.current = false;
        setLoading(false);
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!id || !UUID.test(id)) {
      navigate({ to: "/orders", replace: true });
      return;
    }

    let cancelled = false;
    void loadSession().then((session) => {
      if (cancelled) return;
      if (!session) {
        navigate({ to: "/" });
        return;
      }
      void refresh(id);
    });

    const timer = window.setInterval(() => {
      if (
        !cancelled &&
        document.visibilityState === "visible" &&
        shouldAutoRefresh(deliveryRef.current?.status ?? null)
      ) {
        void refresh(id, true);
      }
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id, navigate, refresh]);

  if (!id || !UUID.test(id)) return null;

  const currentPresentation = trackingPresentation(order?.status ?? null, delivery?.status ?? null);
  const address = order?.deliveryAddress
    ? [
        order.deliveryAddress.addressLine1,
        order.deliveryAddress.addressLine2,
        order.deliveryAddress.landmark,
        order.deliveryAddress.areaName,
        order.deliveryAddress.city,
        order.deliveryAddress.state,
        order.deliveryAddress.postalCode,
      ]
        .filter(Boolean)
        .join(", ")
    : undefined;
  const steps = delivery?.history.length
    ? delivery.history.map((entry) => {
        const item = presentationFor(entry.newStatus);
        return {
          key: `${entry.newStatus}-${entry.recordedAt}`,
          label: item.label,
          desc: updateTime(entry.observedAt),
        };
      })
    : [
        {
          key: order?.status ?? "waiting",
          label: order ? formatOrderStatus(order.status) : "Loading order",
          desc: order
            ? `Updated ${updateTime(order.updatedAt)}`
            : "Getting your latest order update",
        },
      ];

  return (
    <div className="min-h-screen bg-white pb-16 text-[#1A1A1A]">
      <TrackingHeader
        // The header only displays this: pass the short number customers see everywhere.
        orderId={shortOrderNumber(id)}
        onBack={() => navigate({ to: "/orders" })}
        onRefresh={() => void refresh(id, true)}
        refreshing={busy}
      />

      <main className="mx-auto max-w-5xl px-4 py-5 md:px-6 md:py-6">
        {loading ? (
          <div
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
            aria-hidden="true"
          >
            <div className="space-y-5">
              <div className="h-40 animate-pulse rounded-2xl bg-[#F1F3F5]" />
              <div className="h-72 animate-pulse rounded-2xl bg-[#F1F3F5]" />
              <div className="h-40 animate-pulse rounded-2xl bg-[#F1F3F5]" />
            </div>
            <div className="space-y-5">
              <div className="h-72 animate-pulse rounded-2xl bg-[#F1F3F5]" />
              <div className="h-40 animate-pulse rounded-2xl bg-[#F1F3F5]" />
            </div>
          </div>
        ) : !order ? (
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center shadow-[0_3px_10px_rgba(0,0,0,0.05)] md:p-12">
            <AlertTriangle
              className="mx-auto h-10 w-10 text-[#C4200F]"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-2xl font-semibold text-[#1A1A1A]">
              Tracking unavailable
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
              {error || UNAVAILABLE}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => void refresh(id)}
                className="craves-primary-action"
              >
                <RefreshCw className="h-5 w-5" aria-hidden="true" />
                Try again
              </button>
              <Link
                to="/orders"
                className="inline-flex min-h-12 items-center rounded-full bg-[#F1F3F5] px-6 text-base font-bold !text-[#1A1A1A]"
              >
                Back to orders
              </Link>
            </div>
          </section>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <div className="space-y-5">
                <CurrentStatusCard
                  label={currentPresentation.label}
                  desc={currentPresentation.description}
                />

                <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_10px_rgba(0,0,0,0.05)] md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                      Order and delivery updates
                    </h2>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void refresh(id, true)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaArrowsRotate
                        className={`text-[#F62E18] ${busy ? "animate-spin" : ""}`}
                        aria-hidden="true"
                      />
                      Refresh
                    </button>
                  </div>
                  <div className="mt-5">
                    <OrderTimeline steps={steps} currentIndex={steps.length - 1} />
                  </div>
                </section>

                {delivery?.trackingUrl && (
                  <a
                    href={delivery.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold !text-[#C4200F] shadow-[0_3px_10px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#F1F3F5]"
                  >
                    Track with the delivery partner
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}

                <DeliveryAddressCard address={address} />
              </div>

              <aside className="space-y-5 lg:sticky lg:top-28">
                <TrackingOrderSummaryCard order={order} />

                <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_10px_rgba(0,0,0,0.05)]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]">
                      <FaArrowsRotate className="text-base" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-semibold text-[#1A1A1A]">
                      Live updates
                    </p>
                  </div>
                  <p role="status" className="mt-3 text-xs leading-5 text-[#6B6B6B]">
                    {message}
                    {lastUpdatedAt
                      ? ` Last checked at ${clockTime.format(lastUpdatedAt)}.`
                      : ""}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#6B6B6B]">
                    This page checks for updates every 30 seconds while it’s open.
                  </p>
                </section>
              </aside>
            </div>

            <Link
              to="/home"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold !text-[#1A1A1A] shadow-[0_3px_10px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#F1F3F5]"
            >
              <FaArrowLeft className="text-sm" aria-hidden="true" />
              Back to home
            </Link>
          </div>
        )}

        {error && order && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]"
          >
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
