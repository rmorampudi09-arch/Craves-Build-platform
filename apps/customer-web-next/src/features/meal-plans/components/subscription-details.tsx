"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomerAddress } from "@/features/addresses/lib/address-contract";
import { indiaBusinessDate, parseCustomerSubscription, type CustomerSubscription, type DayCredit, type DayCreditChoice } from "@/features/meal-plans/lib/subscription-contract";
import type { SubscriptionOccurrence, SubscriptionPlanPolicy } from "@/features/meal-plans/lib/subscription-lifecycle-contract";
import type { PublicSubscriptionSchedule } from "@/features/meal-plans/lib/subscription-schedule-contract";
import { changeDeadline, dayCreditCard, formatMoney, MEAL_PLAN_STATUS, MEAL_STATUS, noticeLength, pauseDaysLine, pauseInfo, planActions, planDay, resumeDateFor, type PlanAction } from "@/features/meal-plans/lib/meal-plan-copy";
import { billingUnit } from "@/features/meal-plans/lib/meal-plan-schedule";
import { firstDishPhoto } from "@/features/meal-plans/api/plan-cover";
import { PlanPhoto } from "@/features/meal-plans/components/plan-photo";
import { Dialog, Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { sessionFetch } from "@/shared/lib/session-fetch";

type Action = "pause" | "resume" | "skip" | "cancel";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const clockOf = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
const mealClock = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const card = "rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:p-6";
const quietButtonBase =
  "inline-flex min-h-11 items-center justify-center rounded-full !border-0 !bg-[#F1F3F5] px-5 text-sm font-bold !shadow-none";
const quietButton = `${quietButtonBase} !text-[#1A1A1A]`;

function formatSlot(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^\w/, letter => letter.toUpperCase());
}

/** "13:00:00" in the plan's own time → "1:00 pm". */
function serviceClock(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  return clockOf.format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
}

function upTo(minutes: number | null): string {
  if (minutes === null) return "";
  return minutes === 0 ? " any time before a meal" : ` up to ${noticeLength(minutes)} before a meal`;
}

function policyLines(policy: SubscriptionPlanPolicy): string[] {
  return [
    policy.customerSkipEnabled && `Skip a day${upTo(policy.skipCutoffMinutes)}.`,
    policy.customerPauseEnabled && `Pause${upTo(policy.pauseCutoffMinutes)}.`,
    policy.customerResumeEnabled &&
      (policy.resumeLeadMinutes === null ? "Resume any time." : `Restart meals at least ${noticeLength(policy.resumeLeadMinutes)} ahead.`),
    policy.customerCancelEnabled && `Cancel${upTo(policy.cancelCutoffMinutes)}.`,
  ].filter((line): line is string => Boolean(line));
}

const ACTION_COPY: Record<Action, { title: string; confirm: string; busy: string; keep: string; reasonLabel: string }> = {
  pause: { title: "Pause your meal plan?", confirm: "Pause meal plan", busy: "Pausing…", keep: "Not now", reasonLabel: "Tell us why (optional)" },
  resume: { title: "Resume your meal plan?", confirm: "Resume meal plan", busy: "Resuming…", keep: "Not now", reasonLabel: "Add a note (optional)" },
  skip: { title: "Skip a day’s meals?", confirm: "Skip this day", busy: "Skipping…", keep: "Not now", reasonLabel: "Tell us why (optional)" },
  cancel: { title: "Cancel your meal plan?", confirm: "Cancel meal plan", busy: "Cancelling…", keep: "Keep my plan", reasonLabel: "Tell us why (optional)" },
};

const LOADING_PLAN = "Loading your meal plan…";
const CHOICE_ERRORS: Record<string, string> = {
  DAY_CREDIT_ALREADY_SETTLED: "This day has already been settled.",
  DAY_CREDIT_NOT_FOUND: "This choice is no longer available.",
  REFUNDS_NOT_AVAILABLE: "Refunds aren’t available yet. You can add the days at the end instead.",
  EXTEND_NOT_AVAILABLE: "This plan has ended, so days can’t be added. Choose a refund.",
};
const ENDED_LINES: Partial<Record<SubscriptionOccurrence["status"], string>> = {
  SKIPPED: "You skipped this meal.",
  CANCELLED: "This meal was cancelled.",
  FAILED: "We couldn’t place the order for this meal.",
};

/** Locality and city, e.g. "Madhapur, Hyderabad"; the city alone when no area is known. */
function areaLine(address: CustomerAddress): string {
  return [...new Set([address.areaName ?? address.districtName, address.city].filter(Boolean))].join(", ");
}

/** `openAction`: a My plans card's Pause, Resume or Skip a meal, opened here once the plan allows it. */
export function SubscriptionDetails({ subscriptionId, openAction }: { subscriptionId: string; openAction?: PlanAction }) {
  const [item, setItem] = useState<CustomerSubscription | null>(null);
  const [policy, setPolicy] = useState<SubscriptionPlanPolicy | null>(null);
  const [schedule, setSchedule] = useState<PublicSubscriptionSchedule | null>(null);
  const [occurrences, setOccurrences] = useState<SubscriptionOccurrence[]>([]);
  const [message, setMessage] = useState(LOADING_PLAN);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<{ action: Action; step: 1 | 2 } | null>(null);
  const [sheetDate, setSheetDate] = useState("");
  const [reason, setReason] = useState("");
  const [sheetError, setSheetError] = useState("");
  const [typed, setTyped] = useState(false);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [meal, setMeal] = useState<SubscriptionOccurrence | null>(null);
  const [pick, setPick] = useState<{ credit: DayCredit; choice: DayCreditChoice } | null>(null);
  const askedAction = useRef(openAction ?? null);

  const load = useCallback(async () => {
    const subscriptionResponse = await sessionFetch(`/api/subscriptions/${subscriptionId}`, { cache: "no-store" });
    const subscriptionBody = await subscriptionResponse.json().catch(() => null);
    if (subscriptionResponse.status === 401) throw new Error("Your session expired. Sign in again.");
    if (!subscriptionResponse.ok) throw new Error(subscriptionResponse.status === 404 ? "We couldn’t find this meal plan." : "We couldn’t load your meal plan. Please try again.");
    const current = parseCustomerSubscription(subscriptionBody);
    if (!current) throw new Error("We couldn’t load your meal plan. Please try again.");
    setItem(current);

    const [policyResponse, scheduleResponse, occurrenceResponse, addressResponse] = await Promise.all([
      fetch(`/api/subscriptions/plans/${current.planId}/policy`, { cache: "no-store" }),
      fetch(`/api/subscriptions/plans/${current.planId}/schedule`, { cache: "no-store" }),
      sessionFetch(`/api/subscriptions/${subscriptionId}/occurrences?limit=100`, { cache: "no-store" }),
      // Only names the delivery area; the plan works without it.
      sessionFetch("/api/customer/addresses", { cache: "no-store" }).catch(() => null),
    ]);
    const addressBody = addressResponse?.ok ? await addressResponse.json().catch(() => null) : null;
    setAddresses(Array.isArray(addressBody) ? addressBody as CustomerAddress[] : []);

    const loadedPolicy = policyResponse.ok ? await policyResponse.json() as SubscriptionPlanPolicy : null;
    const loadedSchedule = scheduleResponse.ok ? await scheduleResponse.json() as PublicSubscriptionSchedule : null;
    setPolicy(loadedPolicy);
    setSchedule(loadedSchedule);
    if (occurrenceResponse.ok) setOccurrences(await occurrenceResponse.json() as SubscriptionOccurrence[]); else setOccurrences([]);
    setMessage("");

    // Once, on arrival from a card: the same first step as this page's own button, if the plan allows it now.
    const asked = askedAction.current;
    askedAction.current = null;
    if (asked) {
      const now = new Date();
      const restartOn = resumeDateFor(now, loadedPolicy?.resumeLeadMinutes ?? 0, loadedSchedule?.items.map(entry => entry.serviceTime).sort()[0] ?? null);
      if (planActions(current, loadedPolicy, restartOn, indiaBusinessDate(now)).includes(asked)) {
        setSheet({ action: asked, step: 1 });
        setSheetDate(asked === "resume" ? restartOn : asked === "skip" ? current.nextServiceDate || "" : "");
        setReason("");
        setSheetError("");
        setTyped(false);
      }
    }
  }, [subscriptionId]);

  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "We couldn’t load your meal plan. Please try again.")); }, [load]);

  function openSheet(action: Action) {
    setSheet({ action, step: 1 });
    setSheetDate(action === "resume" ? resumeDate : action === "skip" ? item?.nextServiceDate || "" : "");
    setReason("");
    setSheetError("");
    setTyped(false);
  }

  // Same calls and payloads as before; only the way intent is collected changed.
  async function apply(action: Action) {
    const note = reason.trim() || null;
    const request =
      action === "skip"
        ? sessionFetch(`/api/subscriptions/${subscriptionId}/skips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceDate: sheetDate, reason: note }) })
        : sessionFetch(`/api/subscriptions/${subscriptionId}/${action}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action === "resume" ? { resumeDate: sheetDate, reason: note } : { reason: note }),
        });
    setBusy(true);
    setSheetError("");
    try {
      const response = await request;
      if (!response.ok) {
        const day = sheetDate ? planDay(sheetDate) : "";
        const { code } = await response.json().catch(() => ({})) as { code?: string };
        if (code === "SUBSCRIPTION_PAUSE_ALLOWANCE_USED") throw new Error("You’ve used all your pause days for this bill. You can pause again on your next bill.");
        if (code === "RESUME_AFTER_AUTO_RESTART") throw new Error(`Your plan restarts by itself${pausing?.autoDate ? ` on ${planDay(pausing.autoDate)}` : ""}. Choose that day or earlier.`);
        throw new Error(
          response.status !== 409
            ? `We couldn’t ${action === "skip" ? "skip that day" : `${action} your meal plan`}. Please try again.`
            : action === "skip"
              ? `${day} can’t be skipped now. It may be too late, or there’s no meal that day.`
              : action === "resume"
                ? `Meals can’t restart on ${day}. Choose a later date.`
                : `It’s too late to ${action} before the next meal, or your plan just changed. Refresh and try again.`,
        );
      }
      setSheet(null);
      await reloadAfter(
        action === "skip" ? `Skipped: ${planDay(sheetDate)}`
          : action === "resume" ? `Meal plan resumed. Meals restart ${planDay(sheetDate)}.`
            : action === "pause" ? "Meal plan paused." : "Meal plan cancelled.",
      );
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // The change is already saved, so a failed reload must not show as an error to retry.
  async function reloadAfter(done: string) {
    await load().then(() => setMessage(done), () => setMessage(`${done} Tap Refresh to see the latest.`));
  }

  // A choice can't be changed later, so the card's buttons ask first.
  async function choose(credit: DayCredit, choice: DayCreditChoice) {
    setBusy(true);
    setSheetError("");
    try {
      const response = await sessionFetch(`/api/subscriptions/${subscriptionId}/day-credits/${credit.id}/choice`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice }),
      });
      if (!response.ok) {
        const { code } = await response.json().catch(() => ({})) as { code?: string };
        if (response.status === 409) void load().catch(() => undefined); // our copy of the choice is stale
        throw new Error((code && CHOICE_ERRORS[code]) || "We couldn’t save your choice. Please try again.");
      }
      setPick(null);
      await reloadAfter(choice === "REFUND" ? "Refund requested." : "Days added at the end of your plan.");
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : "We couldn’t save your choice. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const scheduleGroups = useMemo(() => {
    if (!schedule) return [];
    const groups = new Map<string, typeof schedule.items>();
    for (const entry of schedule.items) {
      const day = schedule.recurrenceType === "WEEKLY" ? `weekday-${entry.isoDayOfWeek}` : `monthday-${entry.dayOfMonth}`;
      const key = `${day}:${entry.mealSlotCode}:${entry.serviceTime}`;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [schedule]);

  const today = indiaBusinessDate();
  const resumeDate = resumeDateFor(new Date(), policy?.resumeLeadMinutes ?? 0, schedule?.items.map(entry => entry.serviceTime).sort()[0] ?? null);
  const pausing = item ? pauseInfo(item, resumeDate, today) : null;

  if (!item && message === LOADING_PLAN) return <CustomerSectionSkeleton variant="plan-details" label={LOADING_PLAN} />;
  if (!item || !pausing) return <p role="status" className="rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">{message}</p>;
  const address = addresses.find(entry => entry.id === item.deliveryAddressId);
  const pauseLine = pauseDaysLine(item);
  const dishNames = new Map(schedule?.items.map(entry => [entry.menuItemId, entry.itemName ?? "Meal item"]));
  const servings = meal?.items.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0;
  const pickView = pick ? dayCreditCard(pick.credit, today) : null;
  const pickLabel = (pick?.choice === "REFUND" ? pickView?.refundLabel : pickView?.extendLabel) ?? "";
  const deadline = policy?.customerSkipEnabled ? changeDeadline(occurrences, policy.skipCutoffMinutes) : null;
  const paymentRequired = item.status === "PENDING_PAYMENT" || item.status === "PAYMENT_FAILED";
  const copy = sheet ? ACTION_COPY[sheet.action] : null;
  const needsDate = sheet?.action === "skip" || sheet?.action === "resume";
  const references: Array<[string, string]> = [];
  if (policy?.holidayPolicyReference) references.push(["Holidays", policy.holidayPolicyReference]);
  if (policy?.unusedMealPolicyReference) references.push(["Unused meals", policy.unusedMealPolicyReference]);
  if (policy?.refundPolicyReference) references.push(["Refunds", policy.refundPolicyReference]);

  return <div className="space-y-4">
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <PlanPhoto src={item.planImageUrl ?? (schedule ? firstDishPhoto(schedule.items) : null)} className="h-20 w-20" />
          <div>
            <span className="inline-flex rounded-full bg-[#F1F3F5] px-2.5 py-1 text-xs font-bold text-[#1A1A1A]">{MEAL_PLAN_STATUS[item.status]}</span>
            {item.amount !== null && item.currency && <p className="mt-2 text-[#1A1A1A]">
              <strong className="text-xl">{formatMoney(item.amount, item.currency)}</strong>
              {item.billingPeriod && <span className="text-sm text-[#6B6B6B]"> / {billingUnit(item.billingPeriod)}</span>}
            </p>}
            {pausing.restartNote && <p className="mt-2 text-sm font-semibold">{pausing.restartNote}</p>}
          </div>
        </div>
        <button type="button" onClick={() => void load()} className={quietButton}>Refresh</button>
      </div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-[#6B6B6B]">Started</dt><dd className="mt-0.5 font-semibold">{planDay(item.startDate)}</dd></div>
        <div><dt className="text-[#6B6B6B]">Next meal</dt><dd className="mt-0.5 font-semibold">{item.nextServiceDate ? planDay(item.nextServiceDate) : "Not scheduled"}</dd></div>
        <div><dt className="text-[#6B6B6B]">Ends</dt><dd className="mt-0.5 font-semibold">{item.endDate ? planDay(item.endDate) : "No end date"}</dd></div>
        {item.status === "ACTIVE" && item.nextBillingDate && <div><dt className="text-[#6B6B6B]">Renews</dt><dd className="mt-0.5 font-semibold">{planDay(item.nextBillingDate)}</dd></div>}
        <div><dt className="text-[#6B6B6B]">Deliver to</dt><dd className="mt-0.5 font-semibold">{address ? areaLine(address) : item.deliveryAddressId ? "Your saved address" : "Not set"}</dd></div>
      </dl>
      {item.notes && <div className="mt-4 rounded-xl bg-[#F1F3F5] p-4 text-sm leading-6"><p className="font-semibold">Notes for the chef</p><p className="mt-1">{item.notes}</p></div>}
      {paymentRequired && <Link href={`/subscriptions/${item.id}/payment`} className="craves-primary-action mt-5">{item.status === "PAYMENT_FAILED" ? "Try payment again" : "Pay now"}</Link>}
      <p className="text-sm font-medium text-[#1A1A1A]" role="status">{message ? <span className="mt-4 block">{message}</span> : null}</p>
    </section>

    {item.dayCredits.map(credit => {
      const view = dayCreditCard(credit, today);
      return <section key={credit.id} className={card}>
        <h2 className="text-lg font-bold">{view.title}</h2>
        {view.pending ? <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => { setSheetError(""); setPick({ credit, choice: "REFUND" }); }} className={quietButton}>{view.refundLabel}</button>
            {view.extendAvailable && <button type="button" disabled={busy} onClick={() => { setSheetError(""); setPick({ credit, choice: "EXTEND" }); }} className="craves-primary-action">{view.extendLabel}</button>}
          </div>
          {view.note && <p className="mt-3 text-sm text-[#6B6B6B]">{view.note}</p>}
        </> : view.settledLine && <p className="mt-2 text-sm text-[#6B6B6B]">{view.settledLine}</p>}
      </section>;
    })}

    <section className={card}>
      <h2 className="text-lg font-bold">Manage meal plan</h2>
      {!policy ? <p className="mt-2 text-sm text-[#6B6B6B]">Plan changes aren’t available right now. Please try again later.</p> : <>
        {deadline && <p className="mt-2 text-sm font-semibold text-[#1A1A1A]">{deadline}</p>}
        <ul className="mt-3 space-y-1 text-sm text-[#6B6B6B]">{policyLines(policy).map(line => <li key={line}>{line}</li>)}</ul>
        {pauseLine && <p className="mt-3 text-sm font-semibold text-[#1A1A1A]">{pauseLine}</p>}
        {(item.status === "ACTIVE" || item.status === "PAUSED") && <div className="mt-5 flex flex-wrap gap-2">
          {item.status === "PAUSED" && policy.customerResumeEnabled && pausing.resumeOffered && <button type="button" disabled={busy} onClick={() => openSheet("resume")} className="craves-primary-action">Resume meal plan</button>}
          {item.status === "ACTIVE" && policy.customerSkipEnabled && <button type="button" disabled={busy} onClick={() => openSheet("skip")} className={quietButton}>Skip a day</button>}
          {item.status === "ACTIVE" && policy.customerPauseEnabled && <button type="button" disabled={busy || pausing.pauseDisabledLabel !== null} onClick={() => openSheet("pause")} className={`${quietButton} disabled:opacity-60`}>{pausing.pauseDisabledLabel ?? "Pause"}</button>}
          {policy.customerCancelEnabled && <button type="button" disabled={busy} onClick={() => openSheet("cancel")} className={`${quietButtonBase} !text-[#C4200F]`}>Cancel plan</button>}
        </div>}
        {references.length > 0 && <dl className="mt-5 space-y-1 text-xs text-[#6B6B6B]">
          {references.map(([label, value]) => <div key={label}><dt className="inline font-semibold">{label}: </dt><dd className="inline">{value}</dd></div>)}
        </dl>}
      </>}
    </section>

    <section className={card}>
      <h2 className="text-lg font-bold">Meal schedule</h2>
      {!schedule ? <p className="mt-2 text-sm text-[#6B6B6B]">The meal schedule isn’t available right now.</p> : <>
        <p className="mt-1 text-sm text-[#6B6B6B]">{schedule.recurrenceType === "WEEKLY" ? "Every week" : "Every month"}</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">{scheduleGroups.map(([key, entries]) => {
          const first = entries[0];
          const day = schedule.recurrenceType === "WEEKLY" ? WEEKDAYS[(first.isoDayOfWeek ?? 1) - 1] : `Day ${first.dayOfMonth} of the month`;
          return <article key={key} className="rounded-xl bg-[#F1F3F5] p-4">
            <p className="text-sm font-semibold text-[#1A1A1A]">{day} · {formatSlot(first.mealSlotCode)} · {serviceClock(first.serviceTime)}</p>
            <ul className="mt-2 space-y-1">{entries.sort((a, b) => a.sequenceNumber - b.sequenceNumber).map(entry => <li key={`${entry.menuItemId}:${entry.sequenceNumber}`} className="text-sm text-[#1A1A1A]">{entry.itemName ?? "Meal item"} × {entry.quantity}</li>)}</ul>
          </article>;
        })}</div>
      </>}
    </section>

    <section className={card}>
      <h2 className="text-lg font-bold">Your meals</h2>
      {occurrences.length === 0 ? <p className="mt-2 text-sm text-[#6B6B6B]">Your meals will appear here once your plan starts.</p> : <ul className="mt-4 divide-y divide-[#E5E7EB]">{occurrences.map(occurrence => <li key={occurrence.id}>
        <button type="button" aria-haspopup="dialog" onClick={() => setMeal(occurrence)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl !border-0 !bg-transparent px-1 py-3 text-left !shadow-none hover:!bg-[#F1F3F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30">
          <span>
            <span className="block text-sm font-semibold text-[#1A1A1A]">{planDay(occurrence.serviceDate)} · {formatSlot(occurrence.mealSlotCode)}</span>
            <span className="mt-0.5 block text-xs text-[#6B6B6B]">{mealClock.format(new Date(occurrence.serviceAt))} · {occurrence.items.length} item{occurrence.items.length === 1 ? "" : "s"}</span>
          </span>
          <span className="rounded-full bg-[#F1F3F5] px-2.5 py-1 text-xs font-bold text-[#1A1A1A]">{MEAL_STATUS[occurrence.status]}</span>
        </button>
      </li>)}</ul>}
    </section>

    <Sheet
      open={sheet !== null}
      onOpenChange={next => { if (!next) setSheet(null); }}
      busy={busy}
      closeOnOutsideTap={!typed}
      title={copy?.title ?? ""}
      footer={sheet && copy ? <>
        <button type="button" onClick={() => setSheet(null)} disabled={busy} className={secondaryActionClass}>{copy.keep}</button>
        {sheet.step === 1
          ? <button type="button" disabled={needsDate && !sheetDate} onClick={() => setSheet({ action: sheet.action, step: 2 })} className="craves-primary-action w-full sm:w-auto">Continue</button>
          : <button type="button" disabled={busy} aria-busy={busy} onClick={() => void apply(sheet.action)} className="craves-primary-action w-full sm:w-auto">{busy ? copy.busy : copy.confirm}</button>}
      </> : null}
    >
      {sheet && copy ? <div onInputCapture={() => setTyped(true)} className="mt-4 text-sm leading-6 text-[#1A1A1A]">
        {sheet.step === 1 ? <>
          {needsDate && <label className="block font-semibold">
            {sheet.action === "skip" ? "Day to skip" : "Restart meals on"}
            <input type="date" min={sheet.action === "resume" ? resumeDate : today} max={sheet.action === "resume" ? pausing.autoDate ?? undefined : undefined} value={sheetDate} onChange={event => setSheetDate(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-base" />
          </label>}
          <p className={needsDate ? "mt-3 text-[#6B6B6B]" : "text-[#6B6B6B]"}>
            {sheet.action === "pause" && `${pausing.pauseMessage}${policy?.pauseCutoffMinutes ? ` A meal due in the next ${noticeLength(policy.pauseCutoffMinutes)} will still arrive.` : ""}`}
            {sheet.action === "resume" && (sheetDate ? `Meals restart on ${planDay(sheetDate)}.` : "Choose the day your meals should restart.")}
            {sheet.action === "skip" && (sheetDate ? `All meals on ${planDay(sheetDate)} are skipped. Your other days stay the same.` : "Choose the day you don’t need meals.")}
            {sheet.action === "cancel" && <>Meals that haven’t left the kitchen will stop. This can’t be undone. Refunds follow our <Link href="/refunds-cancellations" className="font-semibold text-[#1A1A1A] underline underline-offset-2">refund policy</Link>.</>}
          </p>
        </> : <label className="block font-semibold">
          {copy.reasonLabel}
          <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} className="mt-2 min-h-24 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-base font-normal" />
        </label>}
        {sheetError && <p role="alert" className="mt-3 rounded-xl bg-[#F1F3F5] p-3 font-medium text-[#C4200F]">{sheetError}</p>}
      </div> : null}
    </Sheet>

    <Dialog
      open={pick !== null}
      onOpenChange={next => { if (!next) setPick(null); }}
      busy={busy}
      title={`${pickLabel}?`}
      description={pick?.choice === "REFUND"
        ? "The refund goes back to the UPI or card you paid with. You can’t change this later."
        : "Your plan runs longer by these days. You can’t change this later."}
      footer={pick ? <>
        <button type="button" onClick={() => setPick(null)} disabled={busy} className={secondaryActionClass}>Not now</button>
        <button type="button" disabled={busy} aria-busy={busy} onClick={() => void choose(pick.credit, pick.choice)} className="craves-primary-action w-full sm:w-auto">{busy ? "Saving…" : pickLabel}</button>
      </> : null}
    >
      {sheetError && pick ? <p role="alert" className="mt-3 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]">{sheetError}</p> : null}
    </Dialog>

    <Sheet
      open={meal !== null}
      onOpenChange={next => { if (!next) setMeal(null); }}
      title={meal ? `${formatSlot(meal.mealSlotCode)}, ${planDay(meal.serviceDate)}` : ""}
      footer={meal?.orderId && !ENDED_LINES[meal.status] ? <Link href={`/orders/${meal.orderId}`} className="craves-primary-action w-full sm:w-auto">Track order</Link> : null}
    >
      {meal ? <div className="mt-4 space-y-4 text-sm text-[#1A1A1A]">
        <div>
          <p className="text-base font-bold">{meal.items.map(entry => dishNames.get(entry.menuItemId) ?? "Meal item").join(" + ")}</p>
          <p className="mt-1 text-[#6B6B6B]">{ENDED_LINES[meal.status] ?? MEAL_STATUS[meal.status]}</p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-[#6B6B6B]">Date</dt><dd className="mt-0.5 font-semibold">{planDay(meal.serviceDate)}</dd></div>
          <div><dt className="text-[#6B6B6B]">Time</dt><dd className="mt-0.5 font-semibold">{mealClock.format(new Date(meal.serviceAt))}</dd></div>
          {address && <div><dt className="text-[#6B6B6B]">Delivery address</dt><dd className="mt-0.5 font-semibold">{areaLine(address)}</dd></div>}
          <div><dt className="text-[#6B6B6B]">Quantity</dt><dd className="mt-0.5 font-semibold">{servings} serving{servings === 1 ? "" : "s"}</dd></div>
        </dl>
      </div> : null}
    </Sheet>
  </div>;
}
