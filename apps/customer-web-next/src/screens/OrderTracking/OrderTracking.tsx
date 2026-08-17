"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
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
import { TrackingHeader } from "@/components/tracking/TrackingHeader";
import { CurrentStatusCard } from "@/components/tracking/CurrentStatusCard";
import { OrderTimeline } from "@/components/tracking/OrderTimeline";
import { DeliveryAddressCard } from "@/components/tracking/DeliveryAddressCard";
import { TrackingOrderSummaryCard } from "@/components/tracking/TrackingOrderSummaryCard";

const routeApi = getRouteApi("/tracking");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function responseMessage(value: unknown, fallback: string): string {
  return value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : fallback;
}

export default function TrackingPage() {
  const navigate = useNavigate();
  const { id } = routeApi.useSearch();
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
          throw new Error(responseMessage(orderRaw, "Order could not be loaded."));
        }
        const parsedOrder = parseCustomerOrder(orderRaw);
        if (!parsedOrder || parsedOrder.id.toLowerCase() !== orderId.toLowerCase()) {
          throw new Error("Craves returned an invalid order response.");
        }
        setOrder(parsedOrder);

        if (deliveryResponse.ok) {
          const deliveryRaw = await deliveryResponse.json().catch(() => null);
          const parsedDelivery = parseDeliveryStatusResponse(deliveryRaw);
          if (parsedDelivery.orderId.toLowerCase() !== orderId.toLowerCase()) {
            throw new Error("Craves returned delivery tracking for another order.");
          }
          deliveryRef.current = parsedDelivery;
          setDelivery(parsedDelivery);
          setMessage(
            parsedDelivery.status
              ? "Delivery status loaded from the Craves delivery projection."
              : "A delivery job has not been created for this order yet.",
          );
        } else {
          const deliveryRaw = await deliveryResponse.json().catch(() => null);
          deliveryRef.current = null;
          setDelivery(null);
          setMessage(
            deliveryResponse.status === 404
              ? "Delivery tracking will appear when a delivery job is created."
              : responseMessage(
                  deliveryRaw,
                  "Delivery tracking is temporarily unavailable; the order status is still current.",
                ),
          );
        }
        setLastUpdatedAt(new Date());
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Order tracking is unavailable.",
        );
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

  const deliveryPresentation = presentationFor(delivery?.status ?? null);
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
          desc: new Date(entry.observedAt).toLocaleString("en-IN"),
        };
      })
    : [
        {
          key: order?.status ?? "waiting",
          label: order ? formatOrderStatus(order.status) : "Loading order",
          desc: order
            ? "Current status from the Order Service"
            : "Waiting for the backend response",
        },
      ];

  return (
    <div className="min-h-screen bg-white pb-16 text-[#1A1A1A]">
      <TrackingHeader
        orderId={id}
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
          <section className="rounded-2xl border border-[#F62E18]/25 bg-white p-8 text-center shadow-[0_3px_10px_rgba(0,0,0,0.05)] md:p-12">
            <AlertTriangle
              className="mx-auto h-10 w-10 text-[#F62E18]"
              aria-hidden="true"
            />
            <h1 className="mt-4 text-2xl font-semibold text-[#1A1A1A]">
              Tracking unavailable
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
              {error || "The order could not be loaded."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => void refresh(id)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F62E18] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </button>
              <Link
                to="/orders"
                className="inline-flex min-h-11 items-center rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold !text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
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
                  label={
                    delivery
                      ? deliveryPresentation.label
                      : formatOrderStatus(order.status)
                  }
                  desc={
                    delivery
                      ? deliveryPresentation.description
                      : "This is the current order status from Craves. Delivery tracking begins after a delivery job is created."
                  }
                />

                <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_10px_rgba(0,0,0,0.05)] md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F62E18]">
                        Live progress
                      </p>
                      <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                        Order and delivery timeline
                      </h2>
                    </div>
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
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#F62E18] shadow-[0_3px_10px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#F1F3F5]"
                  >
                    Open delivery-provider tracking
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}

                <DeliveryAddressCard address={address} />
              </div>

              <aside className="space-y-5 lg:sticky lg:top-28">
                <TrackingOrderSummaryCard order={order} />

                <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_10px_rgba(0,0,0,0.05)]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                      <FaArrowsRotate className="text-base" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-semibold text-[#1A1A1A]">
                      Tracking refresh
                    </p>
                  </div>
                  <p role="status" className="mt-3 text-xs leading-5 text-[#6B6B6B]">
                    {message}
                    {lastUpdatedAt
                      ? ` Last checked ${lastUpdatedAt.toLocaleTimeString("en-IN")}.`
                      : ""}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#6B6B6B]">
                    Active delivery states refresh every 30 seconds while this tab is visible. Terminal states stop polling.
                  </p>
                </section>
              </aside>
            </div>

            <Link
              to="/home"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold !text-[#1A1A1A] shadow-[0_3px_10px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#F1F3F5]"
            >
              <FaArrowLeft className="text-sm" aria-hidden="true" />
              Back to discovery
            </Link>
          </div>
        )}

        {error && order && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-[#F62E18]/25 bg-white p-3 text-sm font-medium text-[#C92716]"
          >
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
