"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock3,
  RefreshCw,
} from "lucide-react";
import {
  parseChefOrdersResponse,
  type ChefOrder,
} from "@/lib/chef-order-contract";

type InboxView = "NEEDS_ANSWER" | "IN_PROGRESS" | "PREVIOUS" | "ALL";

const NEEDS_ANSWER = new Set(["CHEF_ACCEPTANCE_PENDING"]);
const IN_PROGRESS = new Set([
  "CHEF_ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
]);
const PREVIOUS = new Set([
  "DELIVERED",
  "CHEF_REJECTED",
  "CANCELLED",
  "REFUNDED",
  "REFUND_FAILED",
]);

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

function statusesFor(view: InboxView): Set<string> | null {
  if (view === "NEEDS_ANSWER") return NEEDS_ANSWER;
  if (view === "IN_PROGRESS") return IN_PROGRESS;
  if (view === "PREVIOUS") return PREVIOUS;
  return null;
}

export function ChefOrderInbox() {
  const [orders, setOrders] = useState<ChefOrder[]>([]);
  const [view, setView] = useState<InboxView>("NEEDS_ANSWER");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chef/orders", {
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
            : response.status === 403
              ? "Your chef approval needs to finish before orders can open."
              : "We couldn’t load your orders right now.";
        throw new Error(message);
      }
      const parsed = parseChefOrdersResponse(raw);
      if (!parsed) throw new Error("We couldn’t read the latest orders. Please refresh.");
      setOrders(
        [...parsed].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
      );
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t load your orders right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      NEEDS_ANSWER: orders.filter((order) => NEEDS_ANSWER.has(order.status)).length,
      IN_PROGRESS: orders.filter((order) => IN_PROGRESS.has(order.status)).length,
      PREVIOUS: orders.filter((order) => PREVIOUS.has(order.status)).length,
      ALL: orders.length,
    }),
    [orders],
  );

  const visibleOrders = useMemo(() => {
    const statuses = statusesFor(view);
    return statuses ? orders.filter((order) => statuses.has(order.status)) : orders;
  }, [orders, view]);

  useEffect(() => {
    if (loading || orders.length === 0) return;
    if (counts.NEEDS_ANSWER > 0) setView("NEEDS_ANSWER");
    else if (counts.IN_PROGRESS > 0) setView("IN_PROGRESS");
    else setView("PREVIOUS");
  }, [counts.IN_PROGRESS, counts.NEEDS_ANSWER, loading, orders.length]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#F62E18]">Orders</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A]">What needs your attention?</h1>
          <p className="mt-2 text-sm text-[#6B6B6B]">New orders that need an answer always appear first.</p>
        </div>
        <button
          type="button"
          disabled={refreshing || loading}
          onClick={() => void load(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#1A1A1A] hover:border-[#F62E18] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl bg-[#F1F3F5]" />)}
          <p className="sr-only" role="status">Loading chef orders</p>
        </div>
      ) : error && orders.length === 0 ? (
        <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5]"><AlertTriangle className="h-6 w-6 text-[#F62E18]" aria-hidden="true" /></span>
          <h2 className="mt-4 text-xl font-bold text-[#1A1A1A]">Orders couldn’t load</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6B6B6B]">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-5 min-h-12 rounded-full bg-[#F62E18] px-6 font-semibold text-white">Try again</button>
        </section>
      ) : orders.length === 0 ? (
        <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center md:p-10">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><ChefHat className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
          <h2 className="mt-5 text-2xl font-bold text-[#1A1A1A]">No orders yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6B6B6B]">New orders will appear here when customers choose your food. You don’t need to do anything right now.</p>
        </section>
      ) : (
        <>
          <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Choose which orders to see">
            {(["NEEDS_ANSWER", "IN_PROGRESS", "PREVIOUS", "ALL"] as const).map((nextView) => {
              const label = nextView === "NEEDS_ANSWER" ? "Needs your answer" : nextView === "IN_PROGRESS" ? "Cooking now" : nextView === "PREVIOUS" ? "Previous" : "All";
              const count = counts[nextView];
              return (
                <button key={nextView} type="button" onClick={() => setView(nextView)} aria-pressed={view === nextView} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${view === nextView ? "border-[#F62E18] bg-[#F62E18] text-white" : "border-[#E5E7EB] bg-white text-[#1A1A1A]"}`}>
                  {label}{count > 0 ? ` (${count})` : ""}
                </button>
              );
            })}
          </nav>

          {visibleOrders.length === 0 ? (
            <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
              <CheckCircle2 className="mx-auto h-7 w-7 text-[#F62E18]" aria-hidden="true" />
              <h2 className="mt-3 text-xl font-bold text-[#1A1A1A]">Nothing here right now</h2>
              <p className="mt-2 text-sm text-[#6B6B6B]">Choose another view if you want to look at older orders.</p>
            </section>
          ) : (
            <div className="space-y-3">
              {visibleOrders.map((order) => {
                const headline = order.items[0]?.itemName ?? "Food order";
                const additional = Math.max(0, order.items.length - 1);
                const urgent = order.status === "CHEF_ACCEPTANCE_PENDING";
                return (
                  <Link key={order.id} href={`/chef/orders/${order.id}`} className={`group block rounded-2xl border bg-white p-5 transition hover:border-[#F62E18]/50 ${urgent ? "border-[#F62E18]/50" : "border-[#E5E7EB]"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${urgent ? "bg-[#F62E18]/10 text-[#F62E18]" : "bg-[#F1F3F5] text-[#6B6B6B]"}`}>{friendlyStatus(order.status)}</span>
                        <h2 className="mt-3 truncate text-xl font-bold text-[#1A1A1A]">{headline}{additional > 0 ? ` +${additional} more` : ""}</h2>
                        <p className="mt-1 text-xs text-[#6B6B6B]">Order #{order.id.slice(-8).toUpperCase()}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-[#6B6B6B] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </div>
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-[#E5E7EB] pt-4">
                      <div className="text-xs text-[#6B6B6B]"><p>{order.items.reduce((sum, item) => sum + item.quantity, 0)} item{order.items.reduce((sum, item) => sum + item.quantity, 0) === 1 ? "" : "s"}</p><p className="mt-1 inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{order.prepTimeMinutes ? `${order.prepTimeMinutes} min prep` : "Prep time not chosen yet"}</p></div>
                      <div className="text-right"><p className="text-xs text-[#6B6B6B]">Food value</p><strong className="text-lg text-[#1A1A1A]">{money(order.foodSubtotal, order.currency)}</strong></div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {lastUpdatedAt ? <p className="text-xs text-[#6B6B6B]">Last refreshed {lastUpdatedAt.toLocaleTimeString("en-IN")}</p> : null}
      {error && orders.length > 0 ? <p role="alert" className="rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#F62E18]">{error}</p> : null}
    </div>
  );
}

export default ChefOrderInbox;
