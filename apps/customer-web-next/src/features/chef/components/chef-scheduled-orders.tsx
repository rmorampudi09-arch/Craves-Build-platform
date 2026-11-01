"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, ChevronRight } from "lucide-react";
import { ChefEmpty, ChefFlash, ChefPill, ChefSection, formatInr } from "@/features/chef/components/chef-ui";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import { FoodTypeMark } from "@/features/chef/components/chef-order-card";
import { ReasonTiles } from "@/features/chef/components/chef-order-actions";
import { answerScheduledOrder, ChefScheduledOrdersError, fetchScheduledOrders } from "@/features/chef/api/chef-scheduled-orders";
import type { ChefOrder } from "@/features/chef/lib/chef-order-contract";
import { shortCustomerName } from "@/features/chef/lib/chef-order-presentation";
import { scheduleWhen, type ChefScheduledOrder } from "@/features/chef/lib/chef-scheduled-orders";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { Dialog, Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    loading: "Loading scheduled orders",
    soonTitle: "Scheduled orders are coming soon", soonText: "Customers will be able to book food for a later time. You’ll confirm each request here.",
    failedTitle: "Scheduled orders couldn’t load", failedText: "Check your internet and try again.", tryAgain: "Try again",
    emptyTitle: "No scheduled orders", emptyText: "When a customer books food for a later time, you confirm it here.", seeNew: "See new orders",
    waiting: "Waiting for you to confirm", confirmed: "Confirmed", showMore: "Show more", loadingMore: "Loading…",
    paid: "Customer has already paid.", paysLater: "Customer pays when you confirm.", passed: "The requested time has passed.",
    decline: "Decline", confirm: "Confirm", declineLabel: "Decline scheduled order #{number}", confirmLabel: "Confirm scheduled order #{number}",
    confirmTitle: "Confirm for {when}?", confirmText: "It shows up in New orders when it is time to cook.", notYet: "Not yet", saving: "Saving…",
    declineTitle: "Why can’t you take #{number}?", refund: "The customer is told right away and gets a full refund.", told: "The customer is told right away.",
    tellBriefly: "Tell us briefly (at least 3 characters)", cancel: "Cancel", declineOrder: "Decline order",
    confirmedDone: "Confirmed. It shows up in New orders when it is time to cook.", declinedDone: "Declined. The customer has been told.",
    answerFailed: "We couldn’t save that. Check your internet and try again.", changed: "This request changed. The list is up to date now.",
  },
  te: {
    loading: "షెడ్యూల్ ఆర్డర్లు లోడ్ అవుతున్నాయి",
    soonTitle: "షెడ్యూల్ ఆర్డర్లు త్వరలో వస్తాయి", soonText: "కస్టమర్లు తర్వాతి సమయానికి ఆహారం బుక్ చేయగలుగుతారు. ప్రతి బుకింగ్‌ను మీరు ఇక్కడ నిర్ధారిస్తారు.",
    failedTitle: "షెడ్యూల్ ఆర్డర్లు లోడ్ కాలేదు", failedText: "ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.", tryAgain: "మళ్లీ ప్రయత్నించండి",
    emptyTitle: "షెడ్యూల్ ఆర్డర్లు లేవు", emptyText: "కస్టమర్ తర్వాతి సమయానికి ఆహారం బుక్ చేస్తే, మీరు ఇక్కడ నిర్ధారిస్తారు.", seeNew: "కొత్త ఆర్డర్లు చూడండి",
    waiting: "మీ నిర్ధారణ కోసం ఎదురుచూస్తున్నవి", confirmed: "నిర్ధారించినవి", showMore: "ఇంకా చూపించండి", loadingMore: "లోడ్ అవుతోంది…",
    paid: "కస్టమర్ ఇప్పటికే చెల్లించారు.", paysLater: "మీరు నిర్ధారించాక కస్టమర్ చెల్లిస్తారు.", passed: "అడిగిన సమయం దాటిపోయింది.",
    decline: "వద్దు", confirm: "నిర్ధారించండి", declineLabel: "షెడ్యూల్ ఆర్డర్ #{number} వద్దు", confirmLabel: "షెడ్యూల్ ఆర్డర్ #{number} నిర్ధారించండి",
    confirmTitle: "{when} కి నిర్ధారించాలా?", confirmText: "వండే సమయం వచ్చినప్పుడు ఇది కొత్త ఆర్డర్లలో కనిపిస్తుంది.", notYet: "ఇంకా లేదు", saving: "సేవ్ అవుతోంది…",
    declineTitle: "#{number} ఎందుకు తీసుకోలేరు?", refund: "కస్టమర్‌కు వెంటనే తెలుస్తుంది, మొత్తం డబ్బు తిరిగి వస్తుంది.", told: "కస్టమర్‌కు వెంటనే తెలుస్తుంది.",
    tellBriefly: "క్లుప్తంగా చెప్పండి (కనీసం 3 అక్షరాలు)", cancel: "రద్దు చేయండి", declineOrder: "ఆర్డర్ తిరస్కరించండి",
    confirmedDone: "నిర్ధారించారు. వండే సమయం వచ్చినప్పుడు ఇది కొత్త ఆర్డర్లలో కనిపిస్తుంది.", declinedDone: "తిరస్కరించారు. కస్టమర్‌కు చెప్పాం.",
    answerFailed: "ఇది సేవ్ చేయలేకపోయాం. ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.", changed: "ఈ బుకింగ్ మారింది. జాబితా ఇప్పుడు తాజాగా ఉంది.",
  },
  kn: {
    loading: "ಶೆಡ್ಯೂಲ್ ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ",
    soonTitle: "ಶೆಡ್ಯೂಲ್ ಆರ್ಡರ್‌ಗಳು ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿವೆ", soonText: "ಗ್ರಾಹಕರು ನಂತರದ ಸಮಯಕ್ಕೆ ಆಹಾರ ಬುಕ್ ಮಾಡಬಹುದು. ಪ್ರತಿ ಬುಕಿಂಗ್ ಅನ್ನು ನೀವು ಇಲ್ಲಿ ಖಚಿತಪಡಿಸುತ್ತೀರಿ.",
    failedTitle: "ಶೆಡ್ಯೂಲ್ ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ", failedText: "ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    emptyTitle: "ಶೆಡ್ಯೂಲ್ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ", emptyText: "ಗ್ರಾಹಕರು ನಂತರದ ಸಮಯಕ್ಕೆ ಆಹಾರ ಬುಕ್ ಮಾಡಿದಾಗ, ನೀವು ಇಲ್ಲಿ ಖಚಿತಪಡಿಸುತ್ತೀರಿ.", seeNew: "ಹೊಸ ಆರ್ಡರ್‌ಗಳನ್ನು ನೋಡಿ",
    waiting: "ನಿಮ್ಮ ಖಚಿತಪಡಿಸುವಿಕೆಗಾಗಿ ಕಾಯುತ್ತಿರುವವು", confirmed: "ಖಚಿತಪಡಿಸಿದವು", showMore: "ಇನ್ನಷ್ಟು ತೋರಿಸಿ", loadingMore: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…",
    paid: "ಗ್ರಾಹಕರು ಈಗಾಗಲೇ ಪಾವತಿಸಿದ್ದಾರೆ.", paysLater: "ನೀವು ಖಚಿತಪಡಿಸಿದ ನಂತರ ಗ್ರಾಹಕರು ಪಾವತಿಸುತ್ತಾರೆ.", passed: "ಕೇಳಿದ ಸಮಯ ಮುಗಿದಿದೆ.",
    decline: "ಬೇಡ", confirm: "ಖಚಿತಪಡಿಸಿ", declineLabel: "ಶೆಡ್ಯೂಲ್ ಆರ್ಡರ್ #{number} ಬೇಡ", confirmLabel: "ಶೆಡ್ಯೂಲ್ ಆರ್ಡರ್ #{number} ಖಚಿತಪಡಿಸಿ",
    confirmTitle: "{when} ಕ್ಕೆ ಖಚಿತಪಡಿಸಬೇಕೇ?", confirmText: "ಅಡುಗೆ ಮಾಡುವ ಸಮಯ ಬಂದಾಗ ಇದು ಹೊಸ ಆರ್ಡರ್‌ಗಳಲ್ಲಿ ಕಾಣುತ್ತದೆ.", notYet: "ಇನ್ನೂ ಇಲ್ಲ", saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…",
    declineTitle: "#{number} ಅನ್ನು ಯಾಕೆ ತೆಗೆದುಕೊಳ್ಳಲಾಗದು?", refund: "ಗ್ರಾಹಕರಿಗೆ ತಕ್ಷಣ ತಿಳಿಸಲಾಗುತ್ತದೆ, ಪೂರ್ತಿ ಹಣ ಹಿಂದಿರುಗಿಸಲಾಗುತ್ತದೆ.", told: "ಗ್ರಾಹಕರಿಗೆ ತಕ್ಷಣ ತಿಳಿಸಲಾಗುತ್ತದೆ.",
    tellBriefly: "ಸಂಕ್ಷಿಪ್ತವಾಗಿ ತಿಳಿಸಿ (ಕನಿಷ್ಠ 3 ಅಕ್ಷರಗಳು)", cancel: "ರದ್ದುಮಾಡಿ", declineOrder: "ಆರ್ಡರ್ ತಿರಸ್ಕರಿಸಿ",
    confirmedDone: "ಖಚಿತಪಡಿಸಿದ್ದೀರಿ. ಅಡುಗೆ ಮಾಡುವ ಸಮಯ ಬಂದಾಗ ಇದು ಹೊಸ ಆರ್ಡರ್‌ಗಳಲ್ಲಿ ಕಾಣುತ್ತದೆ.", declinedDone: "ತಿರಸ್ಕರಿಸಲಾಗಿದೆ. ಗ್ರಾಹಕರಿಗೆ ತಿಳಿಸಲಾಗಿದೆ.",
    answerFailed: "ಇದನ್ನು ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", changed: "ಈ ಬುಕಿಂಗ್ ಬದಲಾಗಿದೆ. ಪಟ್ಟಿ ಈಗ ಹೊಸದಾಗಿದೆ.",
  },
});

/** The chef reads the reason in their language; order-service keeps the English one. */
const DECLINE_REASONS = messages({
  en: { busy: "I’m busy at that time", ingredients: "I don’t have the ingredients", closed: "My kitchen is closed then", other: "Something else" },
  te: { busy: "ఆ సమయంలో నాకు పని ఉంది", ingredients: "కావాల్సిన సరుకులు నా దగ్గర లేవు", closed: "ఆ సమయంలో నా వంటగది మూసి ఉంటుంది", other: "ఇంకేదో కారణం" },
  kn: { busy: "ಆ ಸಮಯದಲ್ಲಿ ನನಗೆ ಕೆಲಸ ಇದೆ", ingredients: "ಬೇಕಾದ ಸಾಮಗ್ರಿ ನನ್ನ ಬಳಿ ಇಲ್ಲ", closed: "ಆ ಸಮಯದಲ್ಲಿ ನನ್ನ ಅಡುಗೆಮನೆ ಮುಚ್ಚಿರುತ್ತದೆ", other: "ಬೇರೆ ಕಾರಣ" },
});

type Queue = { state: "loading" | "soon" | "failed" | "ready"; pending: ChefScheduledOrder[]; cursor: string | null; confirmed: ChefScheduledOrder[] };

/** The requests waiting for the chef and the confirmed ones still to come, read once and after every answer (app useChefScheduledOrdersQueue). */
export function useScheduledOrders() {
  const [queue, setQueue] = useState<Queue>({ state: "loading", pending: [], cursor: null, confirmed: [] });
  const reload = useCallback(async () => {
    try {
      const pending = await fetchScheduledOrders("PENDING");
      // shortcut: only the 50 soonest confirmed requests are read; upgrade when a kitchen holds more at once.
      const confirmed = await fetchScheduledOrders("ACCEPTED", { limit: 50 }).catch(() => null);
      setQueue({
        state: "ready",
        pending: pending.items,
        cursor: pending.hasMore ? pending.nextCursor : null,
        confirmed: (confirmed?.items ?? []).filter((item) => Date.parse(item.requestedFulfilmentAt) > Date.now()),
      });
    } catch (caught) {
      const soon = caught instanceof ChefScheduledOrdersError && caught.code === FEATURE_NOT_AVAILABLE;
      // A list already on screen stays when a later read fails.
      setQueue((current) => ({ ...current, state: soon ? "soon" : current.state === "ready" ? "ready" : "failed" }));
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { ...queue, reload, setQueue };
}
export type ScheduledQueue = ReturnType<typeof useScheduledOrders>;

/** The Scheduled tab: requests to confirm or decline, then the confirmed ones (app ScheduledOrdersList). */
export function ChefScheduledOrders({ queue, orders, onSeeNew }: { queue: ScheduledQueue; orders: readonly ChefOrder[]; onSeeNew(): void }) {
  const text = useText(TEXT);
  const reasons = useText(DECLINE_REASONS);
  const { language } = useLanguage();
  const [confirming, setConfirming] = useState<ChefScheduledOrder | null>(null);
  const [declining, setDeclining] = useState<ChefScheduledOrder | null>(null);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  // The answer already on its way: a second tap in the same moment sends nothing.
  const answering = useRef(false);
  const now = new Date();
  const liveOrder = (orderId: string) => orders.find((order) => order.id.toLowerCase() === orderId.toLowerCase());
  const when = (item: ChefScheduledOrder) => scheduleWhen(item.requestedFulfilmentAt, now, language);

  async function answer(item: ChefScheduledOrder, action: "ACCEPT" | "REJECT", note: string | null = null) {
    if (answering.current) return;
    answering.current = true;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await answerScheduledOrder(item, action, note);
      setNotice(action === "ACCEPT" ? text.confirmedDone : text.declinedDone);
    } catch (caught) {
      setError(caught instanceof ChefScheduledOrdersError && caught.status === 409 ? text.changed : text.answerFailed);
    } finally {
      setConfirming(null);
      setDeclining(null);
      answering.current = false;
      setBusy(false);
      await queue.reload();
    }
  }

  async function loadMore() {
    if (!queue.cursor || more) return;
    setMore(true);
    try {
      const page = await fetchScheduledOrders("PENDING", { cursor: queue.cursor });
      queue.setQueue((current) => ({ ...current, pending: [...current.pending, ...page.items], cursor: page.hasMore ? page.nextCursor : null }));
    } catch {
      setError(text.answerFailed);
    } finally {
      setMore(false);
    }
  }

  const feedback = (
    <>
      <ChefFlash message={notice} onClose={() => setNotice("")} />
      <ChefFlash message={error} tone="danger" onClose={() => setError("")} />
    </>
  );
  if (queue.state === "loading") return <ChefLoading shape="orders" head={false} label={text.loading} />;
  if (queue.state !== "ready" || (queue.pending.length === 0 && queue.confirmed.length === 0)) {
    const empty =
      queue.state === "soon" ? { illustration: "comingSoon" as const, title: text.soonTitle, text: text.soonText }
        : queue.state === "failed" ? { illustration: "loadError" as const, title: text.failedTitle, text: text.failedText }
          : { illustration: "mealPlans" as const, title: text.emptyTitle, text: text.emptyText };
    return (
      <>
        <ChefSection>
          <ChefEmpty
            {...empty}
            action={
              queue.state === "failed" ? <button type="button" onClick={() => void queue.reload()} className="chef-btn is-primary">{text.tryAgain}</button>
                : queue.state === "ready" ? <button type="button" onClick={onSeeNew} className="chef-btn">{text.seeNew}</button>
                  : undefined
            }
          />
        </ChefSection>
        {feedback}
      </>
    );
  }

  const declineReason = reason === DECLINE_REASONS.en.other ? customReason.trim() : reason;
  return (
    <div className="chef-stack">
      {queue.pending.length ? (
        <section aria-labelledby="chef-scheduled-waiting" className="chef-stack">
          <h2 id="chef-scheduled-waiting" className="chef-group-title">{text.waiting}</h2>
          {queue.pending.map((item) => {
            const live = liveOrder(item.orderId);
            const address = live?.deliveryAddress;
            const number = shortOrderNumber(item.orderId);
            const passed = Date.parse(item.requestedFulfilmentAt) <= now.getTime();
            // The chef is answering, so the first name and area show, as on order cards; never the full address or phone.
            const who = [`#${number}`, shortCustomerName(address?.recipientName), address ? (address.areaName ?? address.city) : null].filter(Boolean).join(" · ");
            return (
              <article key={`${item.scheduleRequestId}:${item.orderId}`} className="chef-order-card" aria-labelledby={`chef-scheduled-${item.orderId}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 id={`chef-scheduled-${item.orderId}`} className="flex items-center gap-2 font-display text-[1.125rem] font-bold text-[#1A1A1A]">
                      <CalendarClock className="h-5 w-5 shrink-0" aria-hidden="true" />
                      {when(item)}
                    </h3>
                    <p className="mt-0.5 text-[0.875rem] text-[#6B6B6B]">{who}</p>
                  </div>
                  {live ? <span className="chef-amount text-[1.0625rem] font-bold">{formatInr(live.foodSubtotal, { currency: live.currency })}</span> : null}
                </div>
                {live?.items.length ? (
                  <ul className="chef-order-items">
                    {live.items.map((dish) => (
                      <li key={dish.id}>
                        <span className="chef-order-qty">{dish.quantity}×</span>
                        <FoodTypeMark type={dish.foodType} />
                        <span className="min-w-0">{dish.itemName}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 text-[0.875rem] font-semibold text-[#6B6B6B]">
                  {passed ? text.passed : item.paymentGate === "PAYMENT_BEFORE_CHEF_CONFIRMATION" ? text.paid : text.paysLater}
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="chef-btn is-tall flex-1" disabled={busy || passed} aria-label={format(text.declineLabel, { number })} onClick={() => { setReason(""); setCustomReason(""); setDeclining(item); }}>
                    {text.decline}
                  </button>
                  <button type="button" className="chef-btn is-go is-tall flex-[2]" disabled={busy || passed} aria-label={format(text.confirmLabel, { number })} onClick={() => setConfirming(item)}>
                    {text.confirm}
                  </button>
                </div>
              </article>
            );
          })}
          {queue.cursor ? (
            <button type="button" className="chef-btn justify-self-center" disabled={more} aria-busy={more || undefined} onClick={() => void loadMore()}>
              {more ? text.loadingMore : text.showMore}
            </button>
          ) : null}
        </section>
      ) : null}

      {queue.confirmed.length ? (
        <section aria-labelledby="chef-scheduled-confirmed" className="grid gap-2">
          <h2 id="chef-scheduled-confirmed" className="chef-group-title">{text.confirmed}</h2>
          <ul className="chef-section chef-list">
            {queue.confirmed.map((item) => {
              const live = liveOrder(item.orderId);
              const dishes = live?.items.map((dish) => `${dish.quantity}× ${dish.itemName}`).join(", ");
              return (
                <li key={`${item.scheduleRequestId}:${item.orderId}`}>
                  <Link href={`/chef/orders/${item.orderId}`} className="chef-row">
                    <span className="chef-row-main">
                      <span className="chef-row-title block">{when(item)}</span>
                      <span className="chef-row-meta block">{[`#${shortOrderNumber(item.orderId)}`, dishes].filter(Boolean).join(" · ")}</span>
                    </span>
                    <ChefPill tone="active">{text.confirmed}</ChefPill>
                    <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirming(null);
        }}
        busy={busy}
        title={format(text.confirmTitle, { when: confirming ? (language === "en" ? when(confirming).replace(/^(Today|Tomorrow)/, (word) => word.toLowerCase()) : when(confirming)) : "" })}
        description={text.confirmText}
        footer={
          <>
            <button type="button" className={secondaryActionClass} disabled={busy} onClick={() => setConfirming(null)}>{text.notYet}</button>
            <button type="button" className="craves-primary-action w-full sm:w-auto" aria-busy={busy || undefined} disabled={busy} onClick={() => confirming && void answer(confirming, "ACCEPT")}>
              {busy ? text.saving : text.confirm}
            </button>
          </>
        }
      />
      <Sheet
        open={declining !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDeclining(null);
        }}
        busy={busy}
        closeOnOutsideTap={!customReason.trim()}
        title={format(text.declineTitle, { number: declining ? shortOrderNumber(declining.orderId) : "" })}
        description={declining?.paymentGate === "PAYMENT_BEFORE_CHEF_CONFIRMATION" ? text.refund : text.told}
        footer={
          <>
            <button type="button" className={secondaryActionClass} disabled={busy} onClick={() => setDeclining(null)}>{text.cancel}</button>
            <button type="button" className="craves-primary-action w-full sm:w-auto" aria-busy={busy || undefined} disabled={busy || declineReason.length < 3} onClick={() => declining && void answer(declining, "REJECT", declineReason)}>
              {busy ? text.saving : text.declineOrder}
            </button>
          </>
        }
      >
        {/* Sheets open outside the chef page: the theme brings the chef colours along. */}
        <div className="chef-panel-theme chef-sheet-theme mt-4">
          <ReasonTiles name="scheduled-decline" reasons={DECLINE_REASONS.en} labels={reasons} value={reason} onChange={setReason} />
          {reason === DECLINE_REASONS.en.other ? (
            <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">
              {text.tellBriefly}
              <textarea value={customReason} maxLength={500} onChange={(event) => setCustomReason(event.target.value)} className="mt-2 block min-h-24 w-full rounded-xl border bg-white px-4 py-3 text-base text-[#1A1A1A]" data-craves-single-border="true" />
            </label>
          ) : null}
        </div>
      </Sheet>
      {feedback}
    </div>
  );
}
