// Pure helpers for the chef's daily limits, ported from the app: how many plates a meal can take, kept for subscribers, per dish, per date.
import { dayRangeLabel, MEAL_SLOTS, mealSlotLabel, type MealSlot } from "./chef-meal-plans.ts";
import type {
  ChefCapacityDateOverride,
  ChefCapacityMenuDateOverride,
  ChefCapacityMenuRule,
  ChefCapacitySlotRule,
} from "./chef-subscription-capacity-contract.ts";
import type { ChefMealSchedule } from "./chef-subscription-plan-contract.ts";

export const DEFAULT_TOTAL_PLATES = 20;
export const DEFAULT_SUBSCRIBER_PLATES = 10;
export const DEFAULT_DISH_MAX = 10;
/** The most the server accepts for one limit. */
export const MAX_PLATES = 100_000;
const WEEKDAYS = [1, 2, 3, 4, 5];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type ScheduleDays = Pick<ChefMealSchedule, "recurrenceType" | "items">;

/** Days of the week the plans serve `slot`; Monday to Friday when no weekly plan says. A limit is saved for each of them. */
export function limitDays(schedules: readonly ScheduleDays[], slot: MealSlot): number[] {
  const days = new Set<number>();
  for (const { recurrenceType, items } of schedules) {
    for (const item of items)
      if (recurrenceType === "WEEKLY" && item.mealSlotCode === slot && item.isoDayOfWeek)
        days.add(item.isoDayOfWeek);
  }
  return days.size > 0 ? [...days].sort((a, b) => a - b) : WEEKDAYS;
}

/** The meal the screen opens on: the first the plans serve, else Lunch. */
export function firstServedSlot(schedules: readonly ScheduleDays[]): MealSlot {
  const served = new Set(schedules.flatMap(({ items }) => items.map((item) => item.mealSlotCode)));
  return MEAL_SLOTS.find((slot) => served.has(slot)) ?? "LUNCH";
}

/** "Every weekday lunch", "Every dinner", "Lunch on Mon, Wed – Thu". */
export function limitHeading(slot: MealSlot, days: readonly number[]): string {
  const meal = mealSlotLabel(slot).toLowerCase();
  if (days.length === 7) return `Every ${meal}`;
  if (days.length === WEEKDAYS.length && WEEKDAYS.every((day) => days.includes(day)))
    return `Every weekday ${meal}`;
  return `${mealSlotLabel(slot)} on ${dayRangeLabel("WEEKLY", days)}`;
}

export interface SlotLimits {
  total: number;
  subscriber: number;
  salesEnabled: boolean;
  /** Plates already booked by subscribers. */
  booked: number;
  /** Booked plates above the subscriber limit. */
  deficit: number;
  /** The saved limits of `days` are not all the same, so one save would overwrite some of them. */
  mixed: boolean;
}

/** What the first of `days` that has a rule says; 20 and 10 until the chef sets one. */
export function slotLimits(
  rules: readonly ChefCapacitySlotRule[],
  slot: MealSlot,
  days: readonly number[],
): SlotLimits {
  const found = rules
    .filter((rule) => rule.mealSlotCode === slot && days.includes(rule.isoDayOfWeek))
    .sort((a, b) => a.isoDayOfWeek - b.isoDayOfWeek);
  const rule = found[0];
  if (!rule)
    return {
      total: DEFAULT_TOTAL_PLATES,
      subscriber: DEFAULT_SUBSCRIBER_PLATES,
      salesEnabled: true,
      booked: 0,
      deficit: 0,
      mixed: false,
    };
  const same = (other: ChefCapacitySlotRule) =>
    other.totalCapacityUnits === rule.totalCapacityUnits &&
    other.subscriptionCapacityUnits === rule.subscriptionCapacityUnits &&
    other.salesEnabled === rule.salesEnabled;
  return {
    total: rule.totalCapacityUnits,
    subscriber: rule.subscriptionCapacityUnits,
    salesEnabled: rule.salesEnabled,
    booked: rule.recurringReservedUnits,
    deficit: rule.recurringDeficitUnits,
    mixed: !found.every(same),
  };
}

/** A dish's limit for one meal: the first of `days` that has one, or null when it has none. */
export function dishLimits(
  rules: readonly ChefCapacityMenuRule[],
  menuItemId: string,
  slot: MealSlot,
  days: readonly number[],
): { max: number; salesEnabled: boolean; mixed: boolean } | null {
  const found = rules
    .filter(
      (rule) =>
        rule.menuItemId === menuItemId &&
        rule.mealSlotCode === slot &&
        days.includes(rule.isoDayOfWeek),
    )
    .sort((a, b) => a.isoDayOfWeek - b.isoDayOfWeek);
  const first = found[0];
  return first
    ? {
        max: first.maxSubscriptionUnits,
        salesEnabled: first.salesEnabled,
        mixed: !found.every(
          (rule) =>
            rule.maxSubscriptionUnits === first.maxSubscriptionUnits &&
            rule.salesEnabled === first.salesEnabled,
        ),
      }
    : null;
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, Math.round(value)));

/** A plate count kept whole and between 0 and the most the server accepts. */
export const clampPlates = (value: number) => clamp(value, MAX_PLATES);

/** Kept-for-subscribers can never be more than the total, so lowering the total lowers it too. */
export function setTotalPlates<T extends { total: number; subscriber: number }>(
  values: T,
  total: number,
): T {
  const next = clampPlates(total);
  return { ...values, total: next, subscriber: Math.min(values.subscriber, next) };
}

export function setSubscriberPlates<T extends { total: number; subscriber: number }>(
  values: T,
  subscriber: number,
): T {
  return { ...values, subscriber: clamp(subscriber, values.total) };
}

export function capacityBar(
  { total, subscriber }: { total: number; subscriber: number },
  booked: number,
) {
  const shownBooked = Math.min(booked, subscriber);
  return { booked: shownBooked, free: subscriber - shownBooked, normal: total - subscriber };
}

export const capacityCaption = ({ booked, free, normal }: ReturnType<typeof capacityBar>) =>
  `${booked} subscriber plates booked · ${free} free · ${normal} for normal orders`;

/** "Chicken curry: max 10 a day" for the first dish limit of that meal, "· +1 more" when there are others. */
export function dishLimitSummary(
  rules: readonly ChefCapacityMenuRule[],
  slot: MealSlot,
  days: readonly number[],
  dishName: (menuItemId: string) => string,
): string {
  const matching = rules.filter(
    (rule) => rule.mealSlotCode === slot && days.includes(rule.isoDayOfWeek),
  );
  const dishes = [...new Set(matching.map((rule) => rule.menuItemId))];
  if (dishes.length === 0) return "No limits set";
  const line = `${dishName(matching[0].menuItemId)}: max ${matching[0].maxSubscriptionUnits} a day`;
  return dishes.length > 1 ? `${line} · +${dishes.length - 1} more` : line;
}

/** "Today", "Tomorrow", "Yesterday", else "Sun 25 Oct", for 'YYYY-MM-DD' dates. */
export function dayLabel(iso: string, today: string): string {
  const at = (value: string) =>
    Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
  const apart = Math.round((at(iso) - at(today)) / 86_400_000);
  if (apart === 0) return "Today";
  if (apart === 1) return "Tomorrow";
  if (apart === -1) return "Yesterday";
  const date = new Date(at(iso));
  return `${SHORT_DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** Upcoming single-date changes for one meal, soonest first: "Tomorrow · closed", "Sun 25 Oct · 15 plates, 5 for subscribers". */
export function dateChangeLines(
  slotChanges: readonly ChefCapacityDateOverride[],
  dishChanges: readonly ChefCapacityMenuDateOverride[],
  slot: MealSlot,
  today: string,
  dishName: (menuItemId: string) => string,
): string[] {
  return [
    ...slotChanges
      .filter((change) => change.mealSlotCode === slot && change.serviceDate >= today)
      .map((change) => ({
        at: change.serviceDate,
        order: 0,
        text: `${dayLabel(change.serviceDate, today)} · ${change.closed ? "closed" : `${change.totalCapacityUnits} plates, ${change.subscriptionCapacityUnits} for subscribers`}`,
      })),
    ...dishChanges
      .filter((change) => change.mealSlotCode === slot && change.serviceDate >= today)
      .map((change) => ({
        at: change.serviceDate,
        order: 1,
        text: `${dayLabel(change.serviceDate, today)} · ${dishName(change.menuItemId)}: ${change.closed ? "closed" : `max ${change.maxSubscriptionUnits}`}`,
      })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order)
    .map((line) => line.text);
}
