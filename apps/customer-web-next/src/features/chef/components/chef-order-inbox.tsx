"use client";

import { ChefError, chefApiError, chefErrorText, isChefAccessText } from "@/features/chef/lib/chef-errors";
import { ChefAccessRetry } from "@/features/chef/components/chef-account-menu";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
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
  chefOrderStatus,
  formatInr,
  isUnpaidOrder,
  timeAgo,
} from "@/features/chef/components/chef-ui";
import { shortOrderNumber } from "@/shared/lib/order-number";
import {
  parseChefOrdersResponse,
  type ChefOrder,
} from "@/features/chef/lib/chef-order-contract";
import { ChefOrderCard, OrderUpdateNotice, chefStatusIcon, focusOrderAfterUpdate, orderUpdateText } from "@/features/chef/components/chef-order-card";
import { mergeOrders, noticeNewOrders, useChefOrderPolling } from "@/features/chef/lib/chef-order-alert";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import { ChefOrderHistoryError, fetchChefOrderHistoryPage } from "@/features/chef/api/chef-order-history";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    loadFailed: "We couldn’t load your orders right now.", readFailed: "We couldn’t read the latest orders. Please refresh.",
    title: "Orders", updated: "Updated {time}", subtitle: "New orders that need an answer come first.", refresh: "Refresh",
    loading: "Loading chef orders", failedTitle: "Orders couldn’t load", tryAgain: "Try again",
    imageAlt: "A home chef stirring a pot of vegetable curry on the stove", emptyTitle: "No orders right now",
    emptyText: "When a customer orders from your kitchen it appears here, and you choose whether you can cook it.", seePast: "See past orders",
    tabsLabel: "Choose which orders to see", tabNew: "New", tabCooking: "Cooking", tabReady: "Ready", tabPast: "Past",
    caughtUp: "You’re all caught up", noneWaiting: "No order is waiting for your answer.",
    nothingHere: "Nothing here right now", chooseAnother: "Choose another filter to see older orders.",
    foodOrder: "Food order", itemOne: "{count} item", itemMany: "{count} items", minPrep: "{minutes} min prep",
    olderSoon: "Older orders are coming soon.", olderFailed: "Older orders couldn’t load.", olderLoading: "Loading older orders…", loadMore: "Load more",
  },
  te: {
    loadFailed: "ఇప్పుడు మీ ఆర్డర్లు లోడ్ చేయలేకపోయాం.", readFailed: "తాజా ఆర్డర్లు చదవలేకపోయాం. 'మళ్లీ చూడండి' నొక్కండి.",
    title: "ఆర్డర్లు", updated: "{time} కి అప్‌డేట్ అయింది", subtitle: "జవాబు ఇవ్వాల్సిన కొత్త ఆర్డర్లు ముందు కనిపిస్తాయి.", refresh: "మళ్లీ చూడండి",
    loading: "ఆర్డర్లు లోడ్ అవుతున్నాయి", failedTitle: "ఆర్డర్లు లోడ్ కాలేదు", tryAgain: "మళ్లీ ప్రయత్నించండి",
    imageAlt: "స్టవ్ మీద గిన్నెలో కూరగాయల కూర కలుపుతున్న ఇంటి చెఫ్", emptyTitle: "ఇప్పుడు ఆర్డర్లు లేవు",
    emptyText: "కస్టమర్ మీ వంటగదిలో ఆర్డర్ చేస్తే అది ఇక్కడ కనిపిస్తుంది. మీరు వండగలరో లేదో మీరే చెప్పండి.", seePast: "పాత ఆర్డర్లు చూడండి",
    tabsLabel: "ఏ ఆర్డర్లు చూడాలో ఎంచుకోండి", tabNew: "కొత్తవి", tabCooking: "వంట అవుతోంది", tabReady: "సిద్ధం", tabPast: "పాతవి",
    caughtUp: "అన్నింటికీ జవాబు ఇచ్చారు", noneWaiting: "మీ జవాబు కోసం ఏ ఆర్డర్ ఎదురుచూడటం లేదు.",
    nothingHere: "ఇప్పుడు ఇక్కడ ఏమీ లేదు", chooseAnother: "పాత ఆర్డర్లు చూడాలంటే పైన వేరేది ఎంచుకోండి.",
    foodOrder: "ఆహార ఆర్డర్", itemOne: "{count} ఐటమ్", itemMany: "{count} ఐటమ్‌లు", minPrep: "వంటకు {minutes} నిమి",
    olderSoon: "పాత ఆర్డర్లు త్వరలో ఇక్కడ కనిపిస్తాయి.", olderFailed: "పాత ఆర్డర్లు లోడ్ కాలేదు.", olderLoading: "పాత ఆర్డర్లు లోడ్ అవుతున్నాయి…", loadMore: "ఇంకా చూపించండి",
  },
  kn: {
    loadFailed: "ಈಗ ನಿಮ್ಮ ಆರ್ಡರ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ.", readFailed: "ಇತ್ತೀಚಿನ ಆರ್ಡರ್‌ಗಳನ್ನು ಓದಲಾಗಲಿಲ್ಲ. 'ಮತ್ತೆ ನೋಡಿ' ಒತ್ತಿ.",
    title: "ಆರ್ಡರ್‌ಗಳು", updated: "{time} ಕ್ಕೆ ಅಪ್‌ಡೇಟ್ ಆಗಿದೆ", subtitle: "ಉತ್ತರಿಸಬೇಕಾದ ಹೊಸ ಆರ್ಡರ್‌ಗಳು ಮೊದಲು ಕಾಣುತ್ತವೆ.", refresh: "ಮತ್ತೆ ನೋಡಿ",
    loading: "ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ", failedTitle: "ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    imageAlt: "ಒಲೆಯ ಮೇಲೆ ಪಾತ್ರೆಯಲ್ಲಿ ತರಕಾರಿ ಸಾರು ಕಲಕುತ್ತಿರುವ ಮನೆಯ ಚೆಫ್", emptyTitle: "ಈಗ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ",
    emptyText: "ಗ್ರಾಹಕರು ನಿಮ್ಮ ಅಡುಗೆಮನೆಯಿಂದ ಆರ್ಡರ್ ಮಾಡಿದಾಗ ಅದು ಇಲ್ಲಿ ಕಾಣುತ್ತದೆ. ನೀವು ಅಡುಗೆ ಮಾಡಬಹುದೇ ಎಂದು ನೀವೇ ತಿಳಿಸಿ.", seePast: "ಹಳೆಯ ಆರ್ಡರ್‌ಗಳನ್ನು ನೋಡಿ",
    tabsLabel: "ಯಾವ ಆರ್ಡರ್‌ಗಳನ್ನು ನೋಡಬೇಕು ಎಂದು ಆಯ್ಕೆಮಾಡಿ", tabNew: "ಹೊಸದು", tabCooking: "ಅಡುಗೆ ಆಗುತ್ತಿದೆ", tabReady: "ಸಿದ್ಧ", tabPast: "ಹಳೆಯವು",
    caughtUp: "ಎಲ್ಲಕ್ಕೂ ಉತ್ತರಿಸಿದ್ದೀರಿ", noneWaiting: "ನಿಮ್ಮ ಉತ್ತರಕ್ಕಾಗಿ ಯಾವ ಆರ್ಡರ್ ಕೂಡ ಕಾಯುತ್ತಿಲ್ಲ.",
    nothingHere: "ಈಗ ಇಲ್ಲಿ ಏನೂ ಇಲ್ಲ", chooseAnother: "ಹಳೆಯ ಆರ್ಡರ್‌ಗಳನ್ನು ನೋಡಲು ಮೇಲೆ ಬೇರೆಯದನ್ನು ಆಯ್ಕೆಮಾಡಿ.",
    foodOrder: "ಆಹಾರ ಆರ್ಡರ್", itemOne: "{count} ಐಟಮ್", itemMany: "{count} ಐಟಮ್‌ಗಳು", minPrep: "ಅಡುಗೆಗೆ {minutes} ನಿಮಿ",
    olderSoon: "ಹಳೆಯ ಆರ್ಡರ್‌ಗಳು ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.", olderFailed: "ಹಳೆಯ ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ.", olderLoading: "ಹಳೆಯ ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…", loadMore: "ಇನ್ನಷ್ಟು ತೋರಿಸಿ",
  },
});

const newestFirst = (orders: ChefOrder[]) =>
  [...orders].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

type InboxView = "NEEDS_ANSWER" | "IN_PROGRESS" | "READY" | "PREVIOUS";

const NEEDS_ANSWER = new Set(["CHEF_ACCEPTANCE_PENDING"]);
const IN_PROGRESS = new Set(["CHEF_ACCEPTED", "PREPARING"]);
const READY = new Set(["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"]);
// Past: every way an order ends.
const PREVIOUS = new Set(["DELIVERED", "CHEF_REJECTED", "CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_FAILED"]);

/** Older orders for Past, a page at a time. "soon": the server has no paging yet, so Past keeps the recent orders only. */
type History = { orders: ChefOrder[]; nextCursor: string | null; state: "loading" | "ready" | "failed" | "soon" };

function statusesFor(view: InboxView): Set<string> {
  if (view === "NEEDS_ANSWER") return NEEDS_ANSWER;
  if (view === "IN_PROGRESS") return IN_PROGRESS;
  if (view === "READY") return READY;
  return PREVIOUS;
}

export function ChefOrderInbox() {
  const text = useText(TEXT);
  const { language } = useLanguage();
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
      if (!response.ok) throw chefApiError(response, raw, text.loadFailed);
      const parsed = parseChefOrdersResponse(raw);
      if (!parsed) throw new ChefError(text.readFailed, "INVALID_CHEF_ORDERS_RESPONSE", response.status);
      noticeNewOrders(parsed);
      setOrders(newestFirst(parsed));
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(chefErrorText(caught, text.loadFailed));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [text]);

  useEffect(() => {
    void load();
  }, [load]);

  // New orders arrive (and ring) on their own; a check never undoes the chef's own tap.
  useChefOrderPolling(!loading, (incoming) => {
    setOrders((current) => newestFirst(mergeOrders(current, incoming)));
    setError("");
    setLastUpdatedAt(new Date());
  });

  const [history, setHistory] = useState<History | null>(null);
  const loadHistory = useCallback(async (cursor: string | null) => {
    setHistory((current) => ({ orders: current?.orders ?? [], nextCursor: cursor, state: "loading" }));
    try {
      const page = await fetchChefOrderHistoryPage({ cursor });
      setHistory((current) => ({ orders: [...(current?.orders ?? []), ...page.orders], nextCursor: page.hasMore ? page.nextCursor : null, state: "ready" }));
    } catch (caught) {
      const soon = caught instanceof ChefOrderHistoryError && caught.code === FEATURE_NOT_AVAILABLE;
      setHistory((current) => ({ orders: current?.orders ?? [], nextCursor: cursor, state: soon ? "soon" : "failed" }));
    }
  }, []);

  // Older orders load only once the chef opens Past.
  useEffect(() => {
    if (view === "PREVIOUS" && !history) void loadHistory(null);
  }, [view, history, loadHistory]);

  // An order the customer hasn't paid for isn't the chef's to cook: no tab, count or empty state counts it.
  const paid = useMemo(() => orders.filter((order) => !isUnpaidOrder(order.status)), [orders]);

  // Past holds the finished orders, recent and older pages; the live copy wins when an order is in both.
  const doneOrders = useMemo(() => {
    const byId = new Map<string, ChefOrder>();
    for (const order of [...(history?.orders ?? []), ...paid]) byId.set(order.id, order);
    return newestFirst([...byId.values()].filter((order) => PREVIOUS.has(order.status)));
  }, [history, paid]);

  const [orderNotice, setOrderNotice] = useState("");
  function updateOrder(order: ChefOrder) {
    setOrders((current) => current.map((existing) => (existing.id === order.id ? order : existing)));
    setOrderNotice(orderUpdateText(order, language));
    // The chef's own answer takes them to where the order went (Cooking, then Ready).
    const next = IN_PROGRESS.has(order.status) ? "IN_PROGRESS" : READY.has(order.status) ? "READY" : null;
    if (next) setView(next);
    focusOrderAfterUpdate(order.id, "chef-order-update");
  }

  const counts = useMemo(
    () => ({
      NEEDS_ANSWER: paid.filter((order) => NEEDS_ANSWER.has(order.status)).length,
      IN_PROGRESS: paid.filter((order) => IN_PROGRESS.has(order.status)).length,
      READY: paid.filter((order) => READY.has(order.status)).length,
      PREVIOUS: doneOrders.length,
    }),
    [doneOrders.length, paid],
  );

  const visibleOrders = useMemo(
    () => (view === "PREVIOUS" ? doneOrders : paid.filter((order) => statusesFor(view).has(order.status))),
    [doneOrders, paid, view],
  );

  // Opens on the most urgent tab once; later checks never move the chef off the tab they chose.
  const pickedView = useRef(false);
  useEffect(() => {
    if (loading || paid.length === 0 || pickedView.current) return;
    pickedView.current = true;
    if (counts.NEEDS_ANSWER > 0) setView("NEEDS_ANSWER");
    else if (counts.IN_PROGRESS > 0) setView("IN_PROGRESS");
    else if (counts.READY > 0) setView("READY");
    else setView("PREVIOUS");
  }, [counts.READY, counts.IN_PROGRESS, counts.NEEDS_ANSWER, loading, paid.length]);

  const tabs = [
    { view: "NEEDS_ANSWER", label: text.tabNew },
    { view: "IN_PROGRESS", label: text.tabCooking },
    { view: "READY", label: text.tabReady },
    { view: "PREVIOUS", label: text.tabPast },
  ] as const;

  return (
    <div>
      <ChefPageHead
        title={text.title}
        subtitle={lastUpdatedAt ? format(text.updated, { time: lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase() }) : text.subtitle}
        action={
          <button type="button" disabled={refreshing || loading} onClick={() => void load(true)} className="chef-btn is-small" aria-busy={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            {text.refresh}
          </button>
        }
      />

      {loading ? (
        <ChefLoading shape="orders" head={false} label={text.loading} />
      ) : error && paid.length === 0 ? (
        <ChefSection>
          <ChefEmpty
            icon={AlertTriangle}
            title={text.failedTitle}
            text={error}
            action={
              isChefAccessText(error) ? (
                <ChefAccessRetry onRetry={() => void load()} />
              ) : (
                <button type="button" onClick={() => void load()} className="chef-btn is-primary">{text.tryAgain}</button>
              )
            }
          />
        </ChefSection>
      ) : paid.length === 0 && !history ? (
        <ChefSection>
          <ChefEmpty
            image={{
              src: "/landing-v20/images/story-grid/cook-pot.png",
              alt: text.imageAlt,
              width: 1760,
              height: 990,
            }}
            title={text.emptyTitle}
            text={text.emptyText}
            action={<button type="button" onClick={() => setView("PREVIOUS")} className="chef-btn">{text.seePast}</button>}
          />
        </ChefSection>
      ) : (
        <div className="chef-stack">
          <nav className="chef-chips is-tabs" aria-label={text.tabsLabel}>
            {tabs.map(({ view: nextView, label }) => {
              const count = counts[nextView];
              return (
                <button key={nextView} type="button" onClick={() => setView(nextView)} aria-pressed={view === nextView} className="chef-chip min-h-[40px]">
                  {label}
                  {count > 0 ? <span className={nextView === "NEEDS_ANSWER" ? "chef-chip-count" : "font-medium opacity-70"}>{count}</span> : null}
                </button>
              );
            })}
          </nav>

          <OrderUpdateNotice id="chef-order-update" text={orderNotice} />

          {visibleOrders.length === 0 && view === "PREVIOUS" && history?.state === "loading" ? null : visibleOrders.length === 0 ? (
            <ChefSection>
              <ChefEmpty
                icon={CheckCircle2}
                title={view === "NEEDS_ANSWER" ? text.caughtUp : text.nothingHere}
                text={view === "NEEDS_ANSWER" ? text.noneWaiting : text.chooseAnother}
              />
            </ChefSection>
          ) : view !== "PREVIOUS" ? (
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
                  const status = chefOrderStatus(order.status, language);
                  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
                  return (
                    <li key={order.id}>
                      <Link href={`/chef/orders/${order.id}`} className="chef-row items-start">
                        <span className="chef-row-main">
                          <span className="flex flex-wrap items-center gap-2">
                            <ChefPill tone={status.tone} icon={chefStatusIcon(order.status)}>{status.label}</ChefPill>
                            <span className="chef-row-meta !mt-0">#{shortOrderNumber(order.id)} · {timeAgo(order.createdAt, undefined, language)}</span>
                          </span>
                          <span className="chef-row-title mt-2 line-clamp-2 block">
                            {order.items.map((item) => `${item.quantity}× ${item.itemName}`).join(", ") || text.foodOrder}
                          </span>
                          <span className="chef-row-meta mt-1 flex items-center gap-1.5">
                            {format(itemCount === 1 ? text.itemOne : text.itemMany, { count: itemCount })}
                            {order.prepTimeMinutes ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                                {format(text.minPrep, { minutes: order.prepTimeMinutes })}
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
          {view === "PREVIOUS" && history ? (
            <div aria-live="polite" className="grid justify-items-center empty:hidden">
              {history.state === "soon" ? (
                <ChefNotice icon={Clock3}>{text.olderSoon}</ChefNotice>
              ) : history.state === "failed" ? (
                <ChefNotice icon={AlertTriangle} tone="danger">
                  <p>{text.olderFailed}</p>
                  <button type="button" onClick={() => void loadHistory(history.nextCursor)} className="chef-btn is-small mt-2">{text.tryAgain}</button>
                </ChefNotice>
              ) : history.state === "loading" || history.nextCursor ? (
                <button type="button" disabled={history.state === "loading"} aria-busy={history.state === "loading" || undefined} onClick={() => void loadHistory(history.nextCursor)} className="chef-btn">
                  {history.state === "loading" ? text.olderLoading : text.loadMore}
                </button>
              ) : null}
            </div>
          ) : null}
          {error ? <ChefNotice icon={AlertTriangle} tone="danger" role="alert">{error}</ChefNotice> : null}
        </div>
      )}
    </div>
  );
}

export default ChefOrderInbox;
