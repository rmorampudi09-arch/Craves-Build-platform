"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { OrderTrackingStatus, OrderTrackingTimeline } from "@/lib/realtime-order-tracking-contract";

const LABELS: Record<OrderTrackingStatus, string> = {
  PAYMENT_PENDING: "Payment pending",
  PAID: "Payment confirmed",
  CHEF_ACCEPTANCE_PENDING: "Waiting for chef confirmation",
  CHEF_ACCEPTED: "Chef accepted your order",
  PREPARING: "Your meal is being prepared",
  READY_FOR_PICKUP: "Ready for pickup",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CHEF_REJECTED: "Chef could not accept the order",
  CANCELLED: "Order cancelled",
  REFUND_PENDING: "Refund in progress",
  REFUNDED: "Refund completed",
  REFUND_FAILED: "Refund needs attention",
};

const TERMINAL = new Set<OrderTrackingStatus>([
  "DELIVERED",
  "CANCELLED",
  "CHEF_REJECTED",
  "REFUNDED",
  "REFUND_FAILED",
]);

export default function OrderTimelinePage() {
  const params = useParams<{ orderId: string }>();
  const orderId = useMemo(() => params.orderId, [params.orderId]);
  const [timeline, setTimeline] = useState<OrderTrackingTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/timeline`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "This order could not be found."
            : response.status === 401
              ? "Please sign in again to view the order timeline."
              : "The order timeline is temporarily unavailable.",
        );
      }
      setTimeline(body as OrderTrackingTimeline);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The order timeline is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!timeline || TERMINAL.has(timeline.currentStatus)) return;
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, [refresh, timeline]);

  return (
    <main className="min-h-screen bg-[#0B1426] px-4 py-8 text-white sm:px-6">
      <section className="mx-auto max-w-3xl rounded-3xl bg-[#FFF8EC] p-6 text-[#0B1426] shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Order timeline</p>
            <h1 className="mt-2 text-3xl font-bold">
              {timeline ? LABELS[timeline.currentStatus] : "Latest order status"}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full bg-[#F6B545] px-4 py-2 text-sm font-semibold text-[#0B1426] disabled:opacity-60"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading && !timeline ? <p className="mt-8 text-sm text-slate-600">Loading the latest status…</p> : null}
        {error ? (
          <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {timeline ? (
          <div className="mt-8 space-y-4">
            {timeline.events.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="font-semibold">{LABELS[timeline.currentStatus]}</p>
                <p className="mt-1 text-sm text-slate-600">
                  The order is active. More timeline events will appear as its status changes.
                </p>
              </div>
            ) : (
              timeline.events.map((event) => (
                <article key={event.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="font-semibold">{LABELS[event.status]}</p>
                  <time className="mt-1 block text-sm text-slate-500" dateTime={event.occurredAt}>
                    {new Date(event.occurredAt).toLocaleString()}
                  </time>
                </article>
              ))
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
