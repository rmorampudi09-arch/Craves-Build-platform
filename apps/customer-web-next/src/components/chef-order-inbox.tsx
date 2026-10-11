"use client";

import { ChefError, chefApiError, chefErrorText } from "@/lib/chef-errors";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock3,
  RefreshCw,
} from "lucide-react";
import {
  ChefEmpty,
  ChefNotice,
  ChefPageHead,
  ChefPill,
  ChefSection,
  ChefSkeleton,
  chefOrderStatus,
  formatInr,
  timeAgo,
} from "@/components/chef-ui";
import { shortOrderNumber } from "@/lib/order-number";
import {
  parseChefOrdersResponse,
  type ChefOrder,
} from "@/lib/chef-order-contract";
import { ChefOrderCard, OrderUpdateNotice, chefStatusIcon, focusOrderAfterUpdate, orderUpdateText } from "@/components/chef-order-card";
import { mergeOrders, noticeNewOrders, useChefOrderPolling } from "@/lib/chef-order-alert";
import { sessionFetch } from "@/services/auth/sessionFetch";

const newestFirst = (orders: ChefOrder[]) =>
  [...orders].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

type InboxView = "NEEDS_ANSWER" | "IN_PROGRESS" | "READY" | "PREVIOUS" | "ALL";

const NEEDS_ANSWER = new Set(["CHEF_ACCEPTANCE_PENDING"]);
const IN_PROGRESS = new Set([
  "CHEF_ACCEPTED",
  "PREPARING",

]);
const READY = new Set(["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"]);
const PREVIOUS = new Set([
  "DELIVERED",

]);

function statusesFor(view: InboxView): Set<string> | null {
  if (view === "NEEDS_ANSWER") return NEEDS_ANSWER;
  if (view === "IN_PROGRESS") return IN_PROGRESS;
  if (view === "READY") return READY;
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
      const response = await sessionFetch("/api/chef/orders", { cache: "no-store" });
      const raw = await response.json().catch(() => null);
      if (!response.ok) throw chefApiError(response, raw, "We couldn’t load your orders right now.");
      const parsed = parseChefOrdersResponse(raw);
      if (!parsed) throw new ChefError("We couldn’t read the latest orders. Please refresh.", "INVALID_CHEF_ORDERS_RESPONSE", response.status);
      noticeNewOrders(parsed);
      setOrders(newestFirst(parsed));
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(chefErrorText(caught, "We couldn’t load your orders right now."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // New orders arrive (and ring) on their own; a check never undoes the chef's own tap.
  useChefOrderPolling(!loading, (incoming) => {
    setOrders((current) => newestFirst(mergeOrders(current, incoming)));
    setError("");
    setLastUpdatedAt(new Date());
  });

  const [orderNotice, setOrderNotice] = useState("");
  function updateOrder(order: ChefOrder) {
    setOrders((current) => current.map((existing) => (existing.id === order.id ? order : existing)));
    setOrderNotice(orderUpdateText(order));
    // The chef's own answer takes them to where the order went (Cooking, then Ready).
    const next = IN_PROGRESS.has(order.status) ? "IN_PROGRESS" : READY.has(order.status) ? "READY" : null;
    if (next) setView((current) => (current === "ALL" ? current : next));
    focusOrderAfterUpdate(order.id, "chef-order-update");
  }

  const counts = useMemo(
    () => ({
      NEEDS_ANSWER: orders.filter((order) => NEEDS_ANSWER.has(order.status)).length,
      IN_PROGRESS: orders.filter((order) => IN_PROGRESS.has(order.status)).length,
      READY: orders.filter((order) => READY.has(order.status)).length,
      PREVIOUS: orders.filter((order) => PREVIOUS.has(order.status)).length,
      ALL: orders.length,
    }),
    [orders],
  );

  const visibleOrders = useMemo(() => {
    const statuses = statusesFor(view);
    return statuses ? orders.filter((order) => statuses.has(order.status)) : orders;
  }, [orders, view]);

  // Opens on the most urgent tab once; later checks never move the chef off the tab they chose.
  const pickedView = useRef(false);
  useEffect(() => {
    if (loading || orders.length === 0 || pickedView.current) return;
    pickedView.current = true;
    if (counts.NEEDS_ANSWER > 0) setView("NEEDS_ANSWER");
    else if (counts.IN_PROGRESS > 0) setView("IN_PROGRESS");
    else if (counts.READY > 0) setView("READY");
    else setView("PREVIOUS");
  }, [counts.READY, counts.IN_PROGRESS, counts.NEEDS_ANSWER, loading, orders.length]);

  const tabs = [
    { view: "NEEDS_ANSWER", label: "New" },
    { view: "IN_PROGRESS", label: "Cooking" },
    { view: "READY", label: "Ready" },
    { view: "PREVIOUS", label: "Done" },
    { view: "ALL", label: "All" },
  ] as const;

  return (
    <div>
      <ChefPageHead
        title="Orders"
        subtitle={lastUpdatedAt ? `Updated ${lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase()}` : "New orders that need an answer come first."}
        action={
          <button type="button" disabled={refreshing || loading} onClick={() => void load(true)} className="chef-btn is-small" aria-busy={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {loading ? (
        <div className="chef-stack" aria-busy="true">
          <ChefSkeleton className="h-10 w-3/4" />
          <ChefSkeleton className="h-64" />
          <p className="sr-only" role="status">Loading chef orders</p>
        </div>
      ) : error && orders.length === 0 ? (
        <ChefSection>
          <ChefEmpty
            icon={AlertTriangle}
            title="Orders couldn’t load"
            text={error}
            action={<button type="button" onClick={() => void load()} className="chef-btn is-primary">Try again</button>}
          />
        </ChefSection>
      ) : orders.length === 0 ? (
        <ChefSection>
          <ChefEmpty
            icon={ChefHat}
            title="No orders yet"
            text="When a customer orders from your kitchen it appears here, and you choose whether you can cook it."
          />
        </ChefSection>
      ) : (
        <div className="chef-stack">
          <nav className="chef-chips" aria-label="Choose which orders to see">
            {tabs.map(({ view: nextView, label }) => {
              const count = counts[nextView];
              return (
                <button key={nextView} type="button" onClick={() => setView(nextView)} aria-pressed={view === nextView} className="chef-chip min-h-[40px]">
                  {label}
                  {nextView === "NEEDS_ANSWER" && count > 0 ? <span className="chef-chip-count">{count}</span> : nextView !== "ALL" && count > 0 ? <span className="font-medium opacity-70">{count}</span> : null}
                </button>
              );
            })}
          </nav>

          <OrderUpdateNotice id="chef-order-update" text={orderNotice} />

          {visibleOrders.length === 0 ? (
            <ChefSection>
              <ChefEmpty
                icon={CheckCircle2}
                title={view === "NEEDS_ANSWER" ? "You’re all caught up" : "Nothing here right now"}
                text={view === "NEEDS_ANSWER" ? "No order is waiting for your answer." : "Choose another filter to see older orders."}
              />
            </ChefSection>
          ) : view === "NEEDS_ANSWER" || view === "IN_PROGRESS" ? (
            // Orders that need the chef: big cards with the answer right on them, oldest first.
            <div key={view} className="chef-stack chef-step">
              {[...visibleOrders].reverse().map((order) => (
                <ChefOrderCard key={order.id} order={order} onUpdated={updateOrder} />
              ))}
            </div>
          ) : (
            <ChefSection flush>
              <ul key={view} className="chef-list chef-step">
                {visibleOrders.map((order) => {
                  const status = chefOrderStatus(order.status);
                  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
                  return (
                    <li key={order.id}>
                      <Link href={`/chef/orders/${order.id}`} className="chef-row items-start">
                        <span className="chef-row-main">
                          <span className="flex flex-wrap items-center gap-2">
                            <ChefPill tone={status.tone} icon={chefStatusIcon(order.status)}>{status.label}</ChefPill>
                            <span className="chef-row-meta !mt-0">#{shortOrderNumber(order.id)} · {timeAgo(order.createdAt)}</span>
                          </span>
                          <span className="chef-row-title mt-2 line-clamp-2 block">
                            {order.items.map((item) => `${item.quantity}× ${item.itemName}`).join(", ") || "Food order"}
                          </span>
                          <span className="chef-row-meta mt-1 flex items-center gap-1.5">
                            {itemCount} item{itemCount === 1 ? "" : "s"}
                            {order.prepTimeMinutes ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                                {order.prepTimeMinutes} min prep
                              </>
                            ) : null}
                          </span>
                        </span>
                        <span className="chef-row-value chef-amount self-center">{formatInr(order.foodSubtotal, { currency: order.currency })}</span>
                        <ChevronRight className="chef-chevron h-5 w-5 self-center" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </ChefSection>
          )}
          {error ? <ChefNotice icon={AlertTriangle} tone="danger" role="alert">{error}</ChefNotice> : null}
        </div>
      )}
    </div>
  );
}

export default ChefOrderInbox;
