"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  MapPin,
  Phone,
  RefreshCw,
  Utensils,
} from "lucide-react";
import { ChefOrderActions } from "@/components/chef-order-actions";
import {
  parseChefOrderResponse,
  type ChefOrder,
} from "@/lib/chef-order-contract";

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function friendlyStatus(status: string): string {
  if (status === "CHEF_ACCEPTANCE_PENDING") return "Needs your answer";
  if (status === "CHEF_ACCEPTED" || status === "PREPARING") return "Cooking";
  if (status === "READY_FOR_PICKUP") return "Ready for pickup";
  if (status === "OUT_FOR_DELIVERY") return "On the way";
  if (status === "DELIVERED") return "Delivered";
  if (status === "CHEF_REJECTED") return "Not taken";
  if (status === "CANCELLED") return "Cancelled";
  if (status.startsWith("REFUND")) return "Closed";
  return "Order received";
}

function itemMetadata(item: ChefOrder["items"][number]): string {
  return [item.category, item.foodType?.replaceAll("_", " ")]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

function responseMessage(value: unknown, fallback: string): string {
  return value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : fallback;
}

export function ChefOrderDetails({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<ChefOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/chef/orders/${encodeURIComponent(orderId)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          responseMessage(
            body,
            response.status === 404 || response.status === 403
              ? "This order isn’t available for your kitchen."
              : "We couldn’t load this order right now.",
          ),
        );
      }
      const parsed = parseChefOrderResponse(body);
      if (!parsed || parsed.id.toLowerCase() !== orderId.toLowerCase()) {
        throw new Error("We couldn’t read this order. Please refresh it.");
      }
      setOrder(parsed);
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t load this order right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4" aria-hidden="true">
        <div className="h-36 animate-pulse rounded-2xl bg-[#F1F3F5]" />
        <div className="h-64 animate-pulse rounded-2xl bg-[#F1F3F5]" />
        <div className="h-56 animate-pulse rounded-2xl bg-[#F1F3F5]" />
        <p className="sr-only" role="status">Loading chef order</p>
      </div>
    );
  }

  if (!order) {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center md:p-10">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5]"><AlertTriangle className="h-6 w-6 text-[#F62E18]" aria-hidden="true" /></span>
        <h1 className="mt-4 text-2xl font-bold text-[#1A1A1A]">This order couldn’t open</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6B6B6B]">{error}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => void load()} className="min-h-12 rounded-full bg-[#F62E18] px-5 font-semibold text-white">Try again</button>
          <Link href="/chef/orders" className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#E5E7EB] bg-white px-5 font-semibold text-[#1A1A1A]">Back to orders</Link>
        </div>
      </section>
    );
  }

  const address = order.deliveryAddress
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
    : null;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-5">
      <Link href="/chef/orders" className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F1F3F5]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to orders</Link>

      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full bg-[#F62E18]/10 px-3 py-1 text-xs font-semibold text-[#F62E18]">{friendlyStatus(order.status)}</span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#1A1A1A]">{order.kitchenName ?? "Kitchen order"}</h1>
            <p className="mt-1 text-xs text-[#6B6B6B]">Order #{order.id.slice(-8).toUpperCase()}</p>
          </div>
          <div className="text-right"><p className="text-xs text-[#6B6B6B]">Food value</p><strong className="mt-1 block text-xl text-[#1A1A1A]">{money(order.foodSubtotal, order.currency)}</strong></div>
        </div>
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-[#6B6B6B]"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Ordered {new Date(order.createdAt).toLocaleString("en-IN")}{order.prepTimeMinutes ? ` · ${order.prepTimeMinutes} min prep` : ""}</p>
      </section>

      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-8">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F1F3F5]"><Utensils className="h-5 w-5 text-[#F62E18]" aria-hidden="true" /></span><div><p className="text-sm font-semibold text-[#F62E18]">What they ordered</p><h2 className="text-xl font-bold text-[#1A1A1A]">{itemCount} item{itemCount === 1 ? "" : "s"}</h2></div></div>
        <div className="mt-5 divide-y divide-[#E5E7EB]">
          {order.items.map((item) => {
            const metadata = itemMetadata(item);
            return (
              <article key={item.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0"><h3 className="font-semibold text-[#1A1A1A]">{item.quantity}× {item.itemName}</h3>{metadata ? <p className="mt-1 text-xs text-[#6B6B6B]">{metadata}</p> : null}</div>
                <strong className="shrink-0 text-[#1A1A1A]">{money(item.lineTotal, order.currency)}</strong>
              </article>
            );
          })}
        </div>
      </section>

      <ChefOrderActions order={order} onUpdated={setOrder} />

      <details className="rounded-3xl border border-[#E5E7EB] bg-white p-5 md:p-6">
        <summary className="cursor-pointer font-semibold text-[#1A1A1A]">More order details</summary>
        {order.deliveryAddress && address ? (
          <div className="mt-5 rounded-2xl bg-[#F1F3F5] p-5">
            <div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-[#F62E18]" aria-hidden="true" /><h2 className="font-semibold text-[#1A1A1A]">Delivery details</h2></div>
            <p className="mt-4 font-semibold text-[#1A1A1A]">{order.deliveryAddress.recipientName}</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#6B6B6B]"><Phone className="h-4 w-4" aria-hidden="true" />{order.deliveryAddress.contactPhoneNumber}</p>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{address}</p>
          </div>
        ) : null}
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Food</dt><dd className="font-semibold text-[#1A1A1A]">{money(order.foodSubtotal, order.currency)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Platform fee</dt><dd className="font-semibold text-[#1A1A1A]">{money(order.platformFee, order.currency)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Tax</dt><dd className="font-semibold text-[#1A1A1A]">{money(order.taxAmount, order.currency)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Delivery</dt><dd className="font-semibold text-[#1A1A1A]">{money(order.deliveryFee, order.currency)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-[#E5E7EB] pt-3"><dt className="font-semibold text-[#1A1A1A]">Customer total</dt><dd className="font-bold text-[#1A1A1A]">{money(order.grandTotal, order.currency)}</dd></div>
        </dl>
        <p className="mt-4 text-xs leading-5 text-[#6B6B6B]">This customer total is not your final earning. Your recorded earnings appear separately in “What I’ve earned.”</p>
      </details>

      <button type="button" disabled={refreshing} onClick={() => void load(true)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#1A1A1A] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />Refresh order</button>
      {lastUpdatedAt ? <p className="text-center text-xs text-[#6B6B6B]">Last refreshed {lastUpdatedAt.toLocaleTimeString("en-IN")}</p> : null}
      {error ? <p role="alert" className="rounded-2xl bg-[#F1F3F5] p-4 text-sm font-medium text-[#F62E18]">{error}</p> : null}
    </div>
  );
}

export default ChefOrderDetails;
