"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CustomerSubscription } from "@/features/meal-plans/lib/subscription-contract";
import type { SubscriptionOccurrence, SubscriptionPlanPolicy } from "@/features/meal-plans/lib/subscription-lifecycle-contract";
import type { PublicSubscriptionSchedule } from "@/features/meal-plans/lib/subscription-schedule-contract";
import { changeDeadline, MEAL_PLAN_STATUS, MEAL_STATUS, noticeLength, planDay } from "@/features/meal-plans/lib/meal-plan-copy";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";

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
  return minutes === null ? "" : ` up to ${noticeLength(minutes)} before a meal`;
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

export function SubscriptionDetails({ subscriptionId }: { subscriptionId: string }) {
  const [item, setItem] = useState<CustomerSubscription | null>(null);
  const [policy, setPolicy] = useState<SubscriptionPlanPolicy | null>(null);
  const [schedule, setSchedule] = useState<PublicSubscriptionSchedule | null>(null);
  const [occurrences, setOccurrences] = useState<SubscriptionOccurrence[]>([]);
  const [message, setMessage] = useState("Loading your meal plan…");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<{ action: Action; step: 1 | 2 } | null>(null);
  const [sheetDate, setSheetDate] = useState("");
  const [reason, setReason] = useState("");
  const [sheetError, setSheetError] = useState("");
  const [typed, setTyped] = useState(false);

  const load = useCallback(async () => {
    const subscriptionResponse = await fetch(`/api/subscriptions/${subscriptionId}`, { cache: "no-store" });
    const subscriptionBody = await subscriptionResponse.json().catch(() => null);
    if (subscriptionResponse.status === 401) throw new Error("Your session expired. Sign in again.");
    if (!subscriptionResponse.ok) throw new Error(subscriptionResponse.status === 404 ? "We couldn’t find this meal plan." : "We couldn’t load your meal plan. Please try again.");
    const current = subscriptionBody as CustomerSubscription;
    setItem(current);

    const [policyResponse, scheduleResponse, occurrenceResponse] = await Promise.all([
      fetch(`/api/subscriptions/plans/${current.planId}/policy`, { cache: "no-store" }),
      fetch(`/api/subscriptions/plans/${current.planId}/schedule`, { cache: "no-store" }),
      fetch(`/api/subscriptions/${subscriptionId}/occurrences?limit=100`, { cache: "no-store" }),
    ]);

    if (policyResponse.ok) setPolicy(await policyResponse.json() as SubscriptionPlanPolicy); else setPolicy(null);
    if (scheduleResponse.ok) setSchedule(await scheduleResponse.json() as PublicSubscriptionSchedule); else setSchedule(null);
    if (occurrenceResponse.ok) setOccurrences(await occurrenceResponse.json() as SubscriptionOccurrence[]); else setOccurrences([]);
    setMessage("");
  }, [subscriptionId]);

  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "We couldn’t load your meal plan. Please try again.")); }, [load]);

  function openSheet(action: Action) {
    setSheet({ action, step: 1 });
    setSheetDate(action === "resume" ? item?.nextServiceDate || item?.startDate || "" : action === "skip" ? item?.nextServiceDate || "" : "");
    setReason("");
    setSheetError("");
    setTyped(false);
  }

  // Same calls and payloads as before; only the way intent is collected changed.
  async function apply(action: Action) {
    const note = reason.trim() || null;
    const request =
      action === "skip"
        ? fetch(`/api/subscriptions/${subscriptionId}/skips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceDate: sheetDate, reason: note }) })
        : fetch(`/api/subscriptions/${subscriptionId}/${action}`, {
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
      await load();
      setSheet(null);
      setMessage(
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

  if (!item) return <p role="status" className="rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">{message}</p>;
  const today = new Date().toISOString().slice(0, 10);
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
        <span className="inline-flex rounded-full bg-[#F1F3F5] px-2.5 py-1 text-xs font-bold text-[#1A1A1A]">{MEAL_PLAN_STATUS[item.status]}</span>
        <button type="button" onClick={() => void load()} className={quietButton}>Refresh</button>
      </div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-[#6B6B6B]">Started</dt><dd className="mt-0.5 font-semibold">{planDay(item.startDate)}</dd></div>
        <div><dt className="text-[#6B6B6B]">Next meal</dt><dd className="mt-0.5 font-semibold">{item.nextServiceDate ? planDay(item.nextServiceDate) : "Not scheduled"}</dd></div>
        <div><dt className="text-[#6B6B6B]">Ends</dt><dd className="mt-0.5 font-semibold">{item.endDate ? planDay(item.endDate) : "No end date"}</dd></div>
        <div><dt className="text-[#6B6B6B]">Deliver to</dt><dd className="mt-0.5 font-semibold">{item.deliveryAddressId ? "Your saved address" : "Not set"}</dd></div>
      </dl>
      {item.notes && <div className="mt-4 rounded-xl bg-[#F1F3F5] p-4 text-sm leading-6"><p className="font-semibold">Notes for the chef</p><p className="mt-1">{item.notes}</p></div>}
      {paymentRequired && <Link href={`/subscriptions/${item.id}/payment`} className="craves-primary-action mt-5">{item.status === "PAYMENT_FAILED" ? "Try payment again" : "Pay now"}</Link>}
      <p className="text-sm font-medium text-[#1A1A1A]" role="status">{message ? <span className="mt-4 block">{message}</span> : null}</p>
    </section>

    <section className={card}>
      <h2 className="text-lg font-bold">Manage meal plan</h2>
      {!policy ? <p className="mt-2 text-sm text-[#6B6B6B]">Plan changes aren’t available right now. Please try again later.</p> : <>
        {deadline && <p className="mt-2 text-sm font-semibold text-[#1A1A1A]">{deadline}</p>}
        <ul className="mt-3 space-y-1 text-sm text-[#6B6B6B]">{policyLines(policy).map(line => <li key={line}>{line}</li>)}</ul>
        {(item.status === "ACTIVE" || item.status === "PAUSED") && <div className="mt-5 flex flex-wrap gap-2">
          {item.status === "PAUSED" && policy.customerResumeEnabled && <button type="button" disabled={busy} onClick={() => openSheet("resume")} className="craves-primary-action">Resume meal plan</button>}
          {item.status === "ACTIVE" && policy.customerSkipEnabled && <button type="button" disabled={busy} onClick={() => openSheet("skip")} className={quietButton}>Skip a day</button>}
          {item.status === "ACTIVE" && policy.customerPauseEnabled && <button type="button" disabled={busy} onClick={() => openSheet("pause")} className={quietButton}>Pause</button>}
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
      {occurrences.length === 0 ? <p className="mt-2 text-sm text-[#6B6B6B]">Your meals will appear here once your plan starts.</p> : <ul className="mt-4 divide-y divide-[#E5E7EB]">{occurrences.map(occurrence => <li key={occurrence.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div>
          <p className="text-sm font-semibold">{planDay(occurrence.serviceDate)} · {formatSlot(occurrence.mealSlotCode)}</p>
          <p className="mt-0.5 text-xs text-[#6B6B6B]">{mealClock.format(new Date(occurrence.serviceAt))} · {occurrence.items.length} item{occurrence.items.length === 1 ? "" : "s"}</p>
        </div>
        <span className="rounded-full bg-[#F1F3F5] px-2.5 py-1 text-xs font-bold text-[#1A1A1A]">{MEAL_STATUS[occurrence.status]}</span>
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
            <input type="date" min={today} value={sheetDate} onChange={event => setSheetDate(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-base" />
          </label>}
          <p className={needsDate ? "mt-3 text-[#6B6B6B]" : "text-[#6B6B6B]"}>
            {sheet.action === "pause" && `Meals stop until you resume the plan.${policy?.pauseCutoffMinutes ? ` A meal due in the next ${noticeLength(policy.pauseCutoffMinutes)} will still arrive.` : ""}`}
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
  </div>;
}
