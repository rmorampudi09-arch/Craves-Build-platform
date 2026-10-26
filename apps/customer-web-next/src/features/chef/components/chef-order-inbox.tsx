"use client";

import { ChefError, chefApiError, chefErrorText, isChefAccessText } from "@/features/chef/lib/chef-errors";
import { ChefAccessRetry } from "@/features/chef/components/chef-account-menu";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
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
  ChefUnderlineTabs,
  chefOrderStatus,
  clockTime,
  formatInr,
} from "@/features/chef/components/chef-ui";
import { shortOrderNumber } from "@/shared/lib/order-number";
import {
  parseChefOrdersResponse,
  type ChefOrder,
} from "@/features/chef/lib/chef-order-contract";
import { ChefOrderCard, OrderUpdateNotice, chefStatusIcon, focusOrderAfterUpdate, orderUpdateText } from "@/features/chef/components/chef-order-card";
import { ChefKitchenSwitch } from "@/features/chef/components/chef-kitchen-switch";
import { mergeOrders, noticeNewOrders, useChefOrderPolling } from "@/features/chef/lib/chef-order-alert";
import { PAST_KINDS, finishedAt, groupPastOrders, inboxViewOf, pastGroupLabel, pastKindOf, type InboxView, type PastKind } from "@/features/chef/lib/chef-order-filters";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import type { ChefKitchen } from "@/features/chef/lib/chef-kitchen-types";
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
    tabsLabel: "Choose which orders to see", tabNew: "New", tabCooking: "Cooking", tabReady: "Ready", tabPast: "Past",
    newTitle: "No new orders", newText: "New orders show up here. Keep Craves open while your kitchen is open.",
    cookingTitle: "Nothing cooking", cookingText: "Orders you accept show up here while you cook them.",
    readyTitle: "Nothing waiting for pickup", readyText: "When you mark an order ready, it waits here for the delivery partner.", seeNew: "See new orders",
    pastTitle: "No past orders yet", pastText: "Delivered, rejected and cancelled orders show up here.",
    kindTitle: "No orders here", kindText: "Try another filter.", pastFilters: "Show past orders",
    ALL: "All", DELIVERED: "Delivered", ON_THE_WAY: "On the way", CANCELLED: "Cancelled", REJECTED: "Rejected",
    foodOrder: "Food order", itemOne: "{count} item", itemMany: "{count} items", minPrep: "{minutes} min prep",
    olderSoon: "Older orders are coming soon.", olderFailed: "Older orders couldn’t load.", olderLoading: "Loading older orders…", loadMore: "Load more",
  },
  te: {
    loadFailed: "ఇప్పుడు మీ ఆర్డర్లు లోడ్ చేయలేకపోయాం.", readFailed: "తాజా ఆర్డర్లు చదవలేకపోయాం. 'మళ్లీ చూడండి' నొక్కండి.",
    title: "ఆర్డర్లు", updated: "{time} కి అప్‌డేట్ అయింది", subtitle: "జవాబు ఇవ్వాల్సిన కొత్త ఆర్డర్లు ముందు కనిపిస్తాయి.", refresh: "మళ్లీ చూడండి",
    loading: "ఆర్డర్లు లోడ్ అవుతున్నాయి", failedTitle: "ఆర్డర్లు లోడ్ కాలేదు", tryAgain: "మళ్లీ ప్రయత్నించండి",
    tabsLabel: "ఏ ఆర్డర్లు చూడాలో ఎంచుకోండి", tabNew: "కొత్తవి", tabCooking: "వంట అవుతోంది", tabReady: "సిద్ధం", tabPast: "పాతవి",
    newTitle: "కొత్త ఆర్డర్లు లేవు", newText: "కొత్త ఆర్డర్లు ఇక్కడ కనిపిస్తాయి. మీ వంటగది తెరిచి ఉన్నప్పుడు Craves తెరిచే ఉంచండి.",
    cookingTitle: "ఏదీ వండటం లేదు", cookingText: "మీరు ఒప్పుకున్న ఆర్డర్లు వండుతున్నప్పుడు ఇక్కడ కనిపిస్తాయి.",
    readyTitle: "పికప్ కోసం ఏదీ లేదు", readyText: "ఆర్డర్ సిద్ధం అని గుర్తిస్తే, డెలివరీ వ్యక్తి కోసం ఇక్కడ ఎదురుచూస్తుంది.", seeNew: "కొత్త ఆర్డర్లు చూడండి",
    pastTitle: "ఇంకా పాత ఆర్డర్లు లేవు", pastText: "డెలివరీ అయినవి, తిరస్కరించినవి, రద్దయిన ఆర్డర్లు ఇక్కడ కనిపిస్తాయి.",
    kindTitle: "ఇక్కడ ఆర్డర్లు లేవు", kindText: "వేరేది ఎంచుకోండి.", pastFilters: "పాత ఆర్డర్లు చూపించండి",
    ALL: "అన్నీ", DELIVERED: "డెలివరీ అయినవి", ON_THE_WAY: "దారిలో ఉన్నవి", CANCELLED: "రద్దయినవి", REJECTED: "తిరస్కరించినవి",
    foodOrder: "ఆహార ఆర్డర్", itemOne: "{count} ఐటమ్", itemMany: "{count} ఐటమ్‌లు", minPrep: "వంటకు {minutes} నిమి",
    olderSoon: "పాత ఆర్డర్లు త్వరలో ఇక్కడ కనిపిస్తాయి.", olderFailed: "పాత ఆర్డర్లు లోడ్ కాలేదు.", olderLoading: "పాత ఆర్డర్లు లోడ్ అవుతున్నాయి…", loadMore: "ఇంకా చూపించండి",
  },
  kn: {
    loadFailed: "ಈಗ ನಿಮ್ಮ ಆರ್ಡರ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ.", readFailed: "ಇತ್ತೀಚಿನ ಆರ್ಡರ್‌ಗಳನ್ನು ಓದಲಾಗಲಿಲ್ಲ. 'ಮತ್ತೆ ನೋಡಿ' ಒತ್ತಿ.",
    title: "ಆರ್ಡರ್‌ಗಳು", updated: "{time} ಕ್ಕೆ ಅಪ್‌ಡೇಟ್ ಆಗಿದೆ", subtitle: "ಉತ್ತರಿಸಬೇಕಾದ ಹೊಸ ಆರ್ಡರ್‌ಗಳು ಮೊದಲು ಕಾಣುತ್ತವೆ.", refresh: "ಮತ್ತೆ ನೋಡಿ",
    loading: "ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ", failedTitle: "ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    tabsLabel: "ಯಾವ ಆರ್ಡರ್‌ಗಳನ್ನು ನೋಡಬೇಕು ಎಂದು ಆಯ್ಕೆಮಾಡಿ", tabNew: "ಹೊಸದು", tabCooking: "ಅಡುಗೆ ಆಗುತ್ತಿದೆ", tabReady: "ಸಿದ್ಧ", tabPast: "ಹಳೆಯವು",
    newTitle: "ಹೊಸ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ", newText: "ಹೊಸ ಆರ್ಡರ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ. ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆದಿರುವಾಗ Craves ತೆರೆದೇ ಇಡಿ.",
    cookingTitle: "ಯಾವುದೂ ಅಡುಗೆ ಆಗುತ್ತಿಲ್ಲ", cookingText: "ನೀವು ಒಪ್ಪಿಕೊಂಡ ಆರ್ಡರ್‌ಗಳು ಅಡುಗೆ ಮಾಡುವಾಗ ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.",
    readyTitle: "ಪಿಕಪ್‌ಗಾಗಿ ಯಾವುದೂ ಇಲ್ಲ", readyText: "ಆರ್ಡರ್ ಸಿದ್ಧ ಎಂದು ಗುರುತಿಸಿದಾಗ, ಅದು ಡೆಲಿವರಿ ವ್ಯಕ್ತಿಗಾಗಿ ಇಲ್ಲಿ ಕಾಯುತ್ತದೆ.", seeNew: "ಹೊಸ ಆರ್ಡರ್‌ಗಳನ್ನು ನೋಡಿ",
    pastTitle: "ಇನ್ನೂ ಹಳೆಯ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ", pastText: "ಡೆಲಿವರಿ ಆದ, ತಿರಸ್ಕರಿಸಿದ ಮತ್ತು ರದ್ದಾದ ಆರ್ಡರ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.",
    kindTitle: "ಇಲ್ಲಿ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ", kindText: "ಬೇರೆಯದನ್ನು ಆಯ್ಕೆಮಾಡಿ.", pastFilters: "ಹಳೆಯ ಆರ್ಡರ್‌ಗಳನ್ನು ತೋರಿಸಿ",
    ALL: "ಎಲ್ಲಾ", DELIVERED: "ಡೆಲಿವರಿ ಆದವು", ON_THE_WAY: "ದಾರಿಯಲ್ಲಿರುವವು", CANCELLED: "ರದ್ದಾದವು", REJECTED: "ತಿರಸ್ಕರಿಸಿದವು",
    foodOrder: "ಆಹಾರ ಆರ್ಡರ್", itemOne: "{count} ಐಟಮ್", itemMany: "{count} ಐಟಮ್‌ಗಳು", minPrep: "ಅಡುಗೆಗೆ {minutes} ನಿಮಿ",
    olderSoon: "ಹಳೆಯ ಆರ್ಡರ್‌ಗಳು ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.", olderFailed: "ಹಳೆಯ ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ.", olderLoading: "ಹಳೆಯ ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…", loadMore: "ಇನ್ನಷ್ಟು ತೋರಿಸಿ",
  },
});

const newestFirst = (orders: ChefOrder[]) =>
  [...orders].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

/** Older orders for Past, a page at a time. "soon": the server has no paging yet, so Past keeps the recent orders only. */
type History = { orders: ChefOrder[]; nextCursor: string | null; state: "loading" | "ready" | "failed" | "soon" };

export function ChefOrderInbox() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [orders, setOrders] = useState<ChefOrder[]>([]);
  const [view, setView] = useState<InboxView>("NEEDS_ANSWER");
  const [kind, setKind] = useState<PastKind>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  // The kitchen's switch sits under an empty New list, as on Home; no kitchen (or a failed read) shows none.
  const [kitchen, setKitchen] = useState<ChefKitchen | null>(null);

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

  useEffect(() => {
    let live = true;
    sessionFetch("/api/chef/kitchen", { cache: "no-store" })
      .then(async (response) => (response.ok ? parseChefKitchen(await response.json().catch(() => null)) : null))
      .catch(() => null)
      .then((read) => {
        if (live) setKitchen(read);
      });
    return () => {
      live = false;
    };
  }, []);

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
  const paid = useMemo(() => orders.filter((order) => inboxViewOf(order.status) !== null), [orders]);

  // Past holds the finished orders, recent and older pages; the live copy wins when an order is in both.
  const doneOrders = useMemo(() => {
    const byId = new Map<string, ChefOrder>();
    for (const order of [...(history?.orders ?? []), ...paid]) byId.set(order.id, order);
    return [...byId.values()].filter((order) => inboxViewOf(order.status) === "PREVIOUS").sort((a, b) => finishedAt(b) - finishedAt(a));
  }, [history, paid]);

  const [orderNotice, setOrderNotice] = useState("");
  function updateOrder(order: ChefOrder) {
    setOrders((current) => current.map((existing) => (existing.id === order.id ? order : existing)));
    setOrderNotice(orderUpdateText(order, language));
    // The chef's own answer takes them to where the order went (Cooking, then Ready).
    const next = inboxViewOf(order.status);
    if (next === "IN_PROGRESS" || next === "READY") setView(next);
    focusOrderAfterUpdate(order.id, "chef-order-update");
  }

  const counts = useMemo(() => {
    const count = (target: InboxView) => paid.filter((order) => inboxViewOf(order.status) === target).length;
    return { NEEDS_ANSWER: count("NEEDS_ANSWER"), IN_PROGRESS: count("IN_PROGRESS"), READY: count("READY") };
  }, [paid]);

  // Oldest first: the order that has waited longest gets answered first.
  const liveOrders = useMemo(() => [...paid].reverse().filter((order) => inboxViewOf(order.status) === view), [paid, view]);
  const pastGroups = useMemo(
    () => groupPastOrders(kind === "ALL" ? doneOrders : doneOrders.filter((order) => pastKindOf(order.status) === kind)),
    [doneOrders, kind],
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
    { value: "NEEDS_ANSWER", label: text.tabNew, count: counts.NEEDS_ANSWER, urgent: true },
    { value: "IN_PROGRESS", label: text.tabCooking, count: counts.IN_PROGRESS },
    { value: "READY", label: text.tabReady, count: counts.READY },
    { value: "PREVIOUS", label: text.tabPast },
  ] as const;
  const seeNew = <button type="button" onClick={() => setView("NEEDS_ANSWER")} className="chef-btn">{text.seeNew}</button>;

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
            illustration="loadError"
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
      ) : (
        <div className="chef-stack">
          <ChefUnderlineTabs label={text.tabsLabel} tabs={tabs} value={view} onChange={setView} />

          <OrderUpdateNotice id="chef-order-update" text={orderNotice} />

          {view === "NEEDS_ANSWER" && liveOrders.length === 0 ? (
            <>
              <ChefSection>
                <ChefEmpty illustration="newOrders" title={text.newTitle} text={text.newText} />
              </ChefSection>
              {kitchen ? <ChefKitchenSwitch kitchen={kitchen} onChange={setKitchen} cookingCount={counts.IN_PROGRESS} /> : null}
            </>
          ) : view === "IN_PROGRESS" && liveOrders.length === 0 ? (
            <ChefSection>
              <ChefEmpty illustration="kitchenNoDishes" title={text.cookingTitle} text={text.cookingText} action={seeNew} />
            </ChefSection>
          ) : view === "READY" && liveOrders.length === 0 ? (
            <ChefSection>
              <ChefEmpty illustration="orders" title={text.readyTitle} text={text.readyText} action={seeNew} />
            </ChefSection>
          ) : view !== "PREVIOUS" ? (
            // Orders that need the chef: big cards with the answer right on them, oldest first.
            <div key={view} className="chef-stack chef-step">
              {liveOrders.map((order) => (
                <ChefOrderCard key={order.id} order={order} onUpdated={updateOrder} />
              ))}
            </div>
          ) : doneOrders.length === 0 ? (
            // Nothing finished yet: say so once the older pages have answered.
            history?.state === "loading" ? null : (
              <ChefSection>
                <ChefEmpty illustration="orders" title={text.pastTitle} text={text.pastText} action={seeNew} />
              </ChefSection>
            )
          ) : (
            <>
              <div role="group" aria-label={text.pastFilters} className="chef-chips">
                {PAST_KINDS.map((option) => (
                  <button key={option} type="button" className="chef-chip is-filter" aria-pressed={kind === option} onClick={() => setKind(option)}>
                    {text[option]}
                  </button>
                ))}
              </div>
              {pastGroups.length === 0 ? (
                <ChefSection>
                  <ChefEmpty illustration="search" title={text.kindTitle} text={text.kindText} />
                </ChefSection>
              ) : (
                <div key={kind} className="chef-stack chef-step">
                  {pastGroups.map((group) => (
                    <section key={group.key} aria-labelledby={`chef-past-${group.key}`} className="grid gap-2">
                      <h2 id={`chef-past-${group.key}`} className="px-1 text-[0.875rem] font-bold text-[#6B6B6B]">{pastGroupLabel(group, new Date(), language)}</h2>
                      <ul className="chef-section chef-list">
                        {group.orders.map((order) => {
                          const status = chefOrderStatus(order.status, language);
                          const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
                          return (
                            <li key={order.id}>
                              <Link href={`/chef/orders/${order.id}`} className="chef-row items-start">
                                <span className="chef-row-main">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <ChefPill tone={status.tone} icon={chefStatusIcon(order.status)}>{status.label}</ChefPill>
                                    <span className="chef-row-meta !mt-0">#{shortOrderNumber(order.id)} · {clockTime(order.updatedAt)}</span>
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
                    </section>
                  ))}
                </div>
              )}
            </>
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
