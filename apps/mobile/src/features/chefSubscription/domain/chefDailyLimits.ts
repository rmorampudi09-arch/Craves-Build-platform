// Pure helpers for the chef's daily limits: how many plates a meal can take, kept for subscribers, per dish, per date.
import {formatDayLabel} from '../../chefShell/domain/chefFormat';
import {mealSlotLabel} from '../../mealPlans/domain/mealPlanSchedule';
import type {
  ChefCapacityDateOverride,
  ChefMealSchedule,
  ChefMenuItemCapacityRule,
  ChefMenuItemDateOverride,
  ChefSlotCapacityRule,
} from '../api/chefSubscriptionApi';
import {dayRangeLabel, MEAL_SLOTS, type MealSlot} from './mealPlanEditor';

export const DEFAULT_TOTAL_PLATES = 20;
export const DEFAULT_SUBSCRIBER_PLATES = 10;
/** The most the server accepts for one limit. */
export const MAX_PLATES = 100_000;
const WEEKDAYS = [1, 2, 3, 4, 5];

type ScheduleDays = Pick<ChefMealSchedule, 'recurrenceType' | 'items'>;

/** Days of the week the plans serve `slot`; Monday to Friday when no weekly plan says. A limit is saved for each of them. */
export function limitDays(schedules: readonly ScheduleDays[], slot: MealSlot): number[] {
  const days = new Set<number>();
  for (const {recurrenceType, items} of schedules) {
    for (const item of items) {
      if (recurrenceType === 'WEEKLY' && item.mealSlotCode === slot && item.isoDayOfWeek) {
        days.add(item.isoDayOfWeek);
      }
    }
  }
  return days.size > 0 ? [...days].sort((a, b) => a - b) : WEEKDAYS;
}

/** The meal the screen opens on: the first the plans serve, else Lunch. */
export function firstServedSlot(schedules: readonly ScheduleDays[]): MealSlot {
  const served = new Set(schedules.flatMap(({items}) => items.map(item => item.mealSlotCode)));
  return MEAL_SLOTS.find(slot => served.has(slot)) ?? 'LUNCH';
}

/** "Every weekday lunch", "Every dinner", "Lunch on Mon, Wed – Thu". */
export function limitHeading(slot: MealSlot, days: readonly number[]): string {
  const meal = mealSlotLabel(slot).toLowerCase();
  if (days.length === 7) {
    return `Every ${meal}`;
  }
  if (days.length === WEEKDAYS.length && WEEKDAYS.every(day => days.includes(day))) {
    return `Every weekday ${meal}`;
  }
  return `${mealSlotLabel(slot)} on ${dayRangeLabel('WEEKLY', days)}`;
}

export interface SlotLimits {
  total: number;
  subscriber: number;
  salesEnabled: boolean;
  /** Plates already booked by subscribers. */
  booked: number;
  /** Booked plates above the subscriber limit. */
  deficit: number;
}

/** What the first of `days` that has a rule says; 20 and 10 until the chef sets one. */
export function slotLimits(rules: readonly ChefSlotCapacityRule[], slot: MealSlot, days: readonly number[]): SlotLimits {
  const rule = rules
    .filter(candidate => candidate.mealSlotCode === slot && days.includes(candidate.isoDayOfWeek))
    .sort((a, b) => a.isoDayOfWeek - b.isoDayOfWeek)[0];
  return rule
    ? {
        total: rule.totalCapacityUnits,
        subscriber: rule.subscriptionCapacityUnits,
        salesEnabled: rule.salesEnabled,
        booked: rule.recurringReservedUnits,
        deficit: rule.recurringDeficitUnits,
      }
    : {total: DEFAULT_TOTAL_PLATES, subscriber: DEFAULT_SUBSCRIBER_PLATES, salesEnabled: true, booked: 0, deficit: 0};
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, Math.round(value)));

/** Kept-for-subscribers can never be more than the total, so lowering the total lowers it too. */
export function setTotalPlates<T extends {total: number; subscriber: number}>(values: T, total: number): T {
  const next = clamp(total, MAX_PLATES);
  return {...values, total: next, subscriber: Math.min(values.subscriber, next)};
}

export function setSubscriberPlates<T extends {total: number; subscriber: number}>(values: T, subscriber: number): T {
  return {...values, subscriber: clamp(subscriber, values.total)};
}

export interface CapacityBar {
  booked: number;
  free: number;
  normal: number;
}

export function capacityBar({total, subscriber}: {total: number; subscriber: number}, booked: number): CapacityBar {
  const shownBooked = Math.min(booked, subscriber);
  return {booked: shownBooked, free: subscriber - shownBooked, normal: total - subscriber};
}

export function capacityCaption({booked, free, normal}: CapacityBar): string {
  return `${booked} subscriber plates booked · ${free} free · ${normal} for normal orders`;
}

/** "Chicken curry: max 10 a day" for the first dish limit of that meal, "· +1 more" when there are others. */
export function dishLimitSummary(
  rules: readonly ChefMenuItemCapacityRule[],
  slot: MealSlot,
  days: readonly number[],
  dishName: (menuItemId: string) => string,
): string {
  const dishes = [
    ...new Set(
      rules
        .filter(rule => rule.mealSlotCode === slot && days.includes(rule.isoDayOfWeek))
        .map(rule => rule.menuItemId),
    ),
  ];
  if (dishes.length === 0) {
    return 'No limits set';
  }
  const first = rules.find(rule => rule.menuItemId === dishes[0] && rule.mealSlotCode === slot && days.includes(rule.isoDayOfWeek))!;
  const line = `${dishName(first.menuItemId)}: max ${first.maxSubscriptionUnits} a day`;
  return dishes.length > 1 ? `${line} · +${dishes.length - 1} more` : line;
}

/** Upcoming single-date changes for one meal, soonest first: "Tomorrow · closed", "Sun 25 Oct · 15 plates, 5 for subscribers". */
export function dateChangeLines(
  slotChanges: readonly ChefCapacityDateOverride[],
  dishChanges: readonly ChefMenuItemDateOverride[],
  slot: MealSlot,
  now: Date,
  dishName: (menuItemId: string) => string,
): string[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const day = (serviceDate: string) => {
    const [year, month, date] = serviceDate.split('-').map(Number);
    return formatDayLabel(new Date(year, month - 1, date), now, {weekday: true});
  };
  return [
    ...slotChanges
      .filter(change => change.mealSlotCode === slot && change.serviceDate >= today)
      .map(change => ({
        at: change.serviceDate,
        order: 0,
        text: `${day(change.serviceDate)} · ${
          change.closed ? 'closed' : `${change.totalCapacityUnits} plates, ${change.subscriptionCapacityUnits} for subscribers`
        }`,
      })),
    ...dishChanges
      .filter(change => change.mealSlotCode === slot && change.serviceDate >= today)
      .map(change => ({
        at: change.serviceDate,
        order: 1,
        text: `${day(change.serviceDate)} · ${dishName(change.menuItemId)}: ${
          change.closed ? 'closed' : `max ${change.maxSubscriptionUnits}`
        }`,
      })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order)
    .map(line => line.text);
}
