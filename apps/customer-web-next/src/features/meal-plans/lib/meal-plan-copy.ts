import { indiaBusinessDate, type CustomerSubscription, type CustomerSubscriptionStatus, type DayCredit } from "./subscription-contract.ts";
import { mealSlotLabel } from "./meal-plan-schedule.ts";
import type { SubscriptionOccurrence, SubscriptionPlanPolicy } from "./subscription-lifecycle-contract.ts";

/** Customer words for meal plans; never the raw enums or minute counts. */
const INDIA = "Asia/Kolkata";
const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: INDIA });
const clock = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: INDIA });
const dayParts = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export const MEAL_PLAN_STATUS: Record<CustomerSubscriptionStatus, string> = {
  PENDING_PAYMENT: "Payment needed",
  ACTIVE: "Active",
  PAUSED: "Paused",
  PAYMENT_FAILED: "Payment didn’t go through",
  EXPIRED: "Ended",
  CANCELLED: "Cancelled",
};

export const MEAL_STATUS: Record<SubscriptionOccurrence["status"], string> = {
  BILLING_PENDING: "Awaiting payment",
  PAYMENT_PENDING: "Awaiting payment",
  READY_FOR_ORDER: "Scheduled",
  ORDER_REQUESTED: "Order placed",
  ORDER_CREATED: "Order placed",
  SKIPPED: "Skipped",
  CANCELLED: "Cancelled",
  FAILED: "Couldn’t be placed",
};

/** "₹1,200", or "₹1,499.50" when there are paise. */
export function formatMoney(value: number, currency: string): string {
  try {
    const paise = Number.isInteger(value) ? 0 : 2;
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: paise, maximumFractionDigits: paise }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** "Mon 12 Oct" for a plan date (YYYY-MM-DD). */
export function planDay(date: string): string {
  const parts = dayParts.formatToParts(new Date(`${date}T00:00:00Z`));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/** "45 minutes", "12 hours", "1 day". */
export function noticeLength(minutes: number): string {
  const [amount, unit] =
    minutes < 60 ? [minutes, "minute"] : minutes < 1440 ? [Math.round(minutes / 60), "hour"] : [Math.round(minutes / 1440), "day"];
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

function relativeDay(date: string, now: Date): string {
  const today = isoDay.format(now);
  const tomorrow = isoDay.format(new Date(now.getTime() + 86_400_000));
  return date === today ? "today" : date === tomorrow ? "tomorrow" : planDay(date);
}

/** "Changes for tomorrow close at 8:00 pm today." for the next meal that can still change. */
export function changeDeadline(
  occurrences: SubscriptionOccurrence[],
  cutoffMinutes: number | null,
  now = new Date(),
): string | null {
  if (cutoffMinutes === null) return null;
  const changeable = new Set(["BILLING_PENDING", "PAYMENT_PENDING", "READY_FOR_ORDER"]);
  const next = occurrences
    .filter((meal) => changeable.has(meal.status))
    .map((meal) => ({ meal, closes: new Date(Date.parse(meal.serviceAt) - cutoffMinutes * 60_000) }))
    .filter(({ closes }) => closes > now)
    .sort((left, right) => left.closes.getTime() - right.closes.getTime())[0];
  if (!next) return null;
  const closesDay = relativeDay(isoDay.format(next.closes), now);
  const when = closesDay === "today" || closesDay === "tomorrow" ? closesDay : `on ${closesDay}`;
  return `Changes for ${relativeDay(next.meal.serviceDate, now)} close at ${clock.format(next.closes)} ${when}.`;
}

/** "Tomorrow, 4:30 pm · Samosa + Chai": the next meal still to come, as the app's plan card says it; null when none is. */
export function nextMealLine(
  occurrences: readonly Pick<SubscriptionOccurrence, "serviceDate" | "serviceAt" | "status" | "items">[],
  dishNames: ReadonlyMap<string, string>,
  now = new Date(),
): string | null {
  const next = occurrences
    .filter((meal) => Date.parse(meal.serviceAt) > now.getTime() && !["SKIPPED", "CANCELLED", "FAILED"].includes(meal.status))
    .sort((left, right) => Date.parse(left.serviceAt) - Date.parse(right.serviceAt))[0];
  if (!next) return null;
  const day = relativeDay(next.serviceDate, now);
  const dishes = next.items.map((item) => dishNames.get(item.menuItemId) ?? "Meal item").join(" + ");
  return `${day[0].toUpperCase()}${day.slice(1)}, ${clock.format(new Date(next.serviceAt)).toLowerCase()}${dishes ? ` · ${dishes}` : ""}`;
}

export type PlanAction = "pause" | "resume" | "skip";

/** Pause, Resume and Skip a meal, offered exactly when the plan page offers them. */
export function planActions(
  subscription: Pick<CustomerSubscription, "status" | "pauseDaysLeft" | "pauseAutoResumeDate">,
  policy: Pick<SubscriptionPlanPolicy, "customerPauseEnabled" | "customerResumeEnabled" | "customerSkipEnabled"> | null,
  resumeDate: string,
  today: string,
): PlanAction[] {
  if (!policy) return [];
  const pausing = pauseInfo(subscription, resumeDate, today);
  if (subscription.status === "PAUSED") return policy.customerResumeEnabled && pausing.resumeOffered ? ["resume"] : [];
  if (subscription.status !== "ACTIVE") return [];
  return [
    ...(policy.customerPauseEnabled && pausing.pauseDisabledLabel === null ? (["pause"] as const) : []),
    ...(policy.customerSkipEnabled ? (["skip"] as const) : []),
  ];
}

/** Ended and cancelled plans live in History; every other plan is on My plans. */
export function isPastSubscription(status: CustomerSubscriptionStatus): boolean {
  return status === "EXPIRED" || status === "CANCELLED";
}

/**
 * First day from tomorrow (India) whose meal is more than `leadMinutes` away, the rule the server
 * enforces on resume. Without a service time: tomorrow, plus a day per full day of lead.
 */
export function resumeDateFor(now: Date, leadMinutes: number, serviceTime: string | null): string {
  const tomorrow = Date.parse(`${indiaBusinessDate(now)}T00:00:00Z`) + 86_400_000;
  const dates = Array.from({ length: 30 }, (_, index) => new Date(tomorrow + index * 86_400_000).toISOString().slice(0, 10));
  const time = serviceTime ? /^(\d{2}):(\d{2})/.exec(serviceTime) : null;
  if (!time) return dates[Math.min(Math.floor(leadMinutes / 1440), dates.length - 1)];
  return dates.find(day => Date.parse(`${day}T${time[1]}:${time[2]}:00+05:30`) - now.getTime() > leadMinutes * 60_000) ?? dates[dates.length - 1];
}

export type PauseInfo = {
  pauseDisabledLabel: string | null;
  pauseMessage: string;
  restartNote: string | null;
  resumeOffered: boolean;
  /** The automatic restart still ahead; resuming later than it is refused. */
  autoDate: string | null;
};

/** Pause and resume copy from the bill's pause allowance; an older server sends none, so nothing changes. */
export function pauseInfo(
  subscription: Pick<CustomerSubscription, "status" | "pauseDaysLeft" | "pauseAutoResumeDate">,
  resumeDate: string,
  today: string,
): PauseInfo {
  const left = subscription.pauseDaysLeft;
  // An overdue restart (switched off or failed) is ignored, so the customer can always resume.
  const autoDate = subscription.pauseAutoResumeDate && subscription.pauseAutoResumeDate >= today ? subscription.pauseAutoResumeDate : null;
  const paused = subscription.status === "PAUSED";
  return {
    pauseDisabledLabel: !paused && left === 0 ? "No pause days left this bill" : null,
    pauseMessage: typeof left === "number" && left > 0
      ? `You can pause up to ${left} more ${left === 1 ? "day" : "days"} this bill. Your plan restarts by itself after that.`
      : "Upcoming meals stop until you resume the plan.",
    restartNote: paused && autoDate ? `Restarts on ${planDay(autoDate)}` : null,
    // Resuming on or after the automatic restart would change nothing, so it is not offered.
    resumeOffered: !(autoDate && resumeDate >= autoDate),
    autoDate,
  };
}

/** "2 pause days left this bill." under a running plan; null from an older server. */
export function pauseDaysLine(subscription: Pick<CustomerSubscription, "status" | "pauseDaysLeft">): string | null {
  const left = subscription.pauseDaysLeft;
  if (typeof left !== "number" || (subscription.status !== "ACTIVE" && subscription.status !== "PAUSED")) return null;
  return left === 0
    ? "No pause days left this bill."
    : `${left} pause ${left === 1 ? "day" : "days"} left this bill. Your plan restarts by itself after a pause.`;
}

export type DayCreditCard = {
  title: string;
  refundLabel: string;
  extendLabel: string;
  note: string | null;
  settledLine: string | null;
  pending: boolean;
  extendAvailable: boolean;
};

const dayCount = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

/** The refund-or-extend card for one declined day or one pause. */
export function dayCreditCard(credit: DayCredit, today: string): DayCreditCard {
  // A declined meal is offered as one day; a pause as its paid days.
  const days = credit.kind === "PAUSE" ? credit.days ?? 1 : 1;
  const pending = credit.status === "PENDING_CHOICE";
  const deadline = new Date(credit.choiceDeadline);
  const deadlineDay = indiaBusinessDate(deadline);
  const fallback = credit.extendAvailable ? "we’ll add it at the end" : "we’ll request a refund";
  return {
    title: credit.kind === "PAUSE"
      ? `You paused ${dayCount(days)}`
      : `Your chef couldn’t make ${credit.mealSlotCode ? mealSlotLabel(credit.mealSlotCode) : "a meal"} on ${planDay(credit.firstDate)}`,
    refundLabel: credit.refundAmount === null ? "Get a refund" : `Get a refund (${formatMoney(credit.refundAmount, credit.currency ?? "INR")})`,
    extendLabel: `Add ${dayCount(days)} at the end`,
    // The server settles it at the exact deadline, so the time is shown; once that day has passed, nothing is promised.
    note: pending && deadlineDay >= today ? `If you don’t choose by ${clock.format(deadline)} on ${planDay(deadlineDay)}, ${fallback}.` : null,
    settledLine: credit.status === "EXTENDED" ? `${dayCount(days)} added at the end.`
      : credit.status === "REFUND_REQUESTED" ? "Refund requested. It goes back to the UPI or card you paid with."
        : credit.status === "REFUNDED" ? "Refunded to the UPI or card you paid with." : null,
    pending,
    extendAvailable: credit.extendAvailable,
  };
}
