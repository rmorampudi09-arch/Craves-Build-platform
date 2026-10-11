import type { CustomerSubscriptionStatus } from "../features/meal-plans/lib/subscription-contract.ts";
import type { SubscriptionOccurrence } from "../features/meal-plans/lib/subscription-lifecycle-contract.ts";

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
