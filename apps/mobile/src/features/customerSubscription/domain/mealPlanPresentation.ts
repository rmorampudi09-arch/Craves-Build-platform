// Pure presentation helpers for the customer meal-plan screens.
// No Intl and no React: Hermes' Intl support is unreliable, so money and dates are formatted by hand.
import {
  formatServiceTime,
  sortScheduleItems,
  titleCaseCode,
  type ScheduleItemLike,
} from '../../mealPlans/domain/mealPlanSchedule';
import type {IconName} from '../../../shared/components/Icon';
import type {CustomerAddress} from '../../customerAddresses/domain/customerAddressContract';
import type {
  CustomerSubscriptionOccurrence,
  PublicSubscriptionPolicy,
} from '../api/customerSubscriptionApi';

export type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface PlanRule {
  icon: IconName;
  title: string;
  body: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `today`'s local calendar day (plus offset) as a UTC-midnight Date, so day maths ignores DST. */
function calendarDay(today: Date, offsetDays = 0): Date {
  return new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays),
  );
}

function toIsoDate(day: Date): string {
  return `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(day.getUTCDate())}`;
}

export function formatPlanPrice(amount: number | string, currency: string): string {
  const prefix = currency === 'INR' ? '₹' : `${currency} `;
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return `${prefix}${amount}`;
  }
  const [whole, paise] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${value < 0 ? '-' : ''}${prefix}${grouped}${paise === '00' ? '' : `.${paise}`}`;
}

export function formatMealPlanDate(iso: string, style: 'long' | 'short'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return iso;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return iso; // e.g. 2026-02-31 would silently roll into March
  }
  const label = `${WEEKDAYS[date.getUTCDay()]}, ${day} ${MONTHS[month - 1]}`;
  return style === 'long' ? `${label} ${year}` : label;
}

export function upcomingStartDates(today: Date, count = 7): string[] {
  return Array.from({length: count}, (_, i) =>
    toIsoDate(calendarDay(today, i + 1)),
  );
}

export function todayIso(now: Date): string {
  return toIsoDate(calendarDay(now));
}

/** An occurrence's `serviceAt` instant as a device-local "12:30 PM". */
export function occurrenceTimeLabel(serviceAt: string): string {
  const at = new Date(serviceAt);
  return formatServiceTime(`${at.getHours()}:${pad2(at.getMinutes())}`);
}

/**
 * First date from tomorrow whose meal is more than `leadMinutes` away, the rule the server
 * enforces on resume. Without a service time: tomorrow, plus a day per full day of lead.
 */
export function resumeDateFor(
  now: Date,
  leadMinutes: number,
  serviceTime: string | null,
): string {
  const dates = upcomingStartDates(now, 30);
  const time = serviceTime ? /^(\d{1,2}):(\d{2})/.exec(serviceTime) : null;
  if (!time) {
    return dates[Math.min(Math.floor(leadMinutes / 1440), dates.length - 1)];
  }
  return (
    dates.find(iso => {
      const [y, m, d] = iso.split('-').map(Number);
      const serviceAt = new Date(y, m - 1, d, Number(time[1]), Number(time[2]));
      return serviceAt.getTime() - now.getTime() > leadMinutes * 60_000;
    }) ?? dates[dates.length - 1]
  );
}

/** Dates the customer can still skip: not skipped or cancelled, and more than the cutoff away. */
export function skippableDates(
  occs: readonly CustomerSubscriptionOccurrence[],
  now: Date,
  cutoffMinutes: number,
): string[] {
  const dates = occs
    .filter(
      o =>
        o.status !== 'SKIPPED' &&
        o.status !== 'CANCELLED' &&
        Date.parse(o.serviceAt) - now.getTime() > cutoffMinutes * 60_000,
    )
    .map(o => o.serviceDate);
  return [...new Set(dates)].sort();
}

/** Preparing (0) → Out for delivery (1) → Delivered (2); null once the order is cancelled or refunded. */
export function orderTrackerStep(status: string): 0 | 1 | 2 | null {
  if (status === 'DELIVERED') {
    return 2;
  }
  if (status === 'READY_FOR_PICKUP' || status === 'OUT_FOR_DELIVERY') {
    return 1;
  }
  return status === 'CHEF_REJECTED' || status === 'CANCELLED' || status.startsWith('REFUND')
    ? null
    : 0;
}

const SUBSCRIPTION_STATUS: Record<string, {label: string; tone: Tone}> = {
  ACTIVE: {label: 'Active', tone: 'success'},
  PAUSED: {label: 'Paused', tone: 'warning'},
  PENDING_PAYMENT: {label: 'Payment pending', tone: 'warning'},
  PAYMENT_FAILED: {label: 'Payment failed', tone: 'error'},
  CANCELLED: {label: 'Cancelled', tone: 'neutral'},
  EXPIRED: {label: 'Ended', tone: 'neutral'},
};

export function subscriptionStatusPresentation(status: string): {
  label: string;
  tone: Tone;
} {
  return (
    SUBSCRIPTION_STATUS[status] ?? {label: titleCaseCode(status), tone: 'neutral'}
  );
}

type OccurrenceStep = 0 | 1 | 2 | null;

const AWAITING_PAYMENT = {label: 'Awaiting payment', tone: 'warning', step: 0} as const;
const OCCURRENCE_STATUS: Record<
  string,
  {label: string; tone: Tone; step: OccurrenceStep}
> = {
  BILLING_PENDING: AWAITING_PAYMENT,
  PAYMENT_PENDING: AWAITING_PAYMENT,
  READY_FOR_ORDER: {label: 'Scheduled', tone: 'info', step: 1},
  ORDER_REQUESTED: {label: 'Order requested', tone: 'info', step: 1},
  ORDER_CREATED: {label: 'Order placed', tone: 'success', step: 2},
  SKIPPED: {label: 'Skipped', tone: 'neutral', step: null},
  CANCELLED: {label: 'Cancelled', tone: 'neutral', step: null},
  FAILED: {label: "Couldn't place order", tone: 'error', step: null},
};

export function occurrenceStatusPresentation(status: string): {
  label: string;
  tone: Tone;
  step: OccurrenceStep;
} {
  return (
    OCCURRENCE_STATUS[status] ?? {
      label: titleCaseCode(status),
      tone: 'neutral',
      step: null,
    }
  );
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

export function formatCutoff(minutes: number): string {
  return minutes >= 60 && minutes % 60 === 0
    ? plural(minutes / 60, 'hour')
    : plural(minutes, 'minute');
}

export function planRules(policy: PublicSubscriptionPolicy): PlanRule[] {
  const rules: PlanRule[] = [];
  // A cutoff of 0 (or none) means the action is allowed right up to the meal.
  if (policy.customerPauseEnabled) {
    rules.push({
      icon: 'pause',
      title: 'Pause or resume',
      body: policy.pauseCutoffMinutes
        ? `Pause from My Meal Plan up to ${formatCutoff(policy.pauseCutoffMinutes)} before a meal.`
        : 'Pause from My Meal Plan anytime before a meal.',
    });
  }
  if (policy.customerSkipEnabled) {
    rules.push({
      icon: 'calendar',
      title: 'Skip a meal',
      body: policy.skipCutoffMinutes
        ? `Skip any upcoming meal up to ${formatCutoff(policy.skipCutoffMinutes)} before it.`
        : 'Skip any upcoming meal anytime before it.',
    });
  }
  if (policy.customerCancelEnabled) {
    rules.push({
      icon: 'close',
      title: 'Cancel anytime',
      body: 'Cancel anytime. Upcoming meals stop right away; meals already being prepared are still delivered.',
    });
  }
  return rules.length > 0
    ? rules
    : [
        {
          icon: 'info',
          title: 'Plan changes',
          body: 'Contact Craves support to change this plan.',
        },
      ];
}

function sortOccurrences(
  occs: readonly CustomerSubscriptionOccurrence[],
): CustomerSubscriptionOccurrence[] {
  return [...occs].sort((a, b) => {
    if (a.serviceDate !== b.serviceDate) {
      return a.serviceDate < b.serviceDate ? -1 : 1;
    }
    return Date.parse(a.serviceAt) - Date.parse(b.serviceAt);
  });
}

export function weekOccurrences(
  occs: readonly CustomerSubscriptionOccurrence[],
  today: Date,
): CustomerSubscriptionOccurrence[] {
  const sinceMonday = (today.getDay() + 6) % 7;
  const monday = toIsoDate(calendarDay(today, -sinceMonday));
  const sunday = toIsoDate(calendarDay(today, 6 - sinceMonday));
  return sortOccurrences(
    occs.filter(o => o.serviceDate >= monday && o.serviceDate <= sunday),
  );
}

export function nextOccurrence(
  occs: readonly CustomerSubscriptionOccurrence[],
  today: Date,
): CustomerSubscriptionOccurrence | null {
  const from = todayIso(today);
  return (
    sortOccurrences(occs).find(
      o =>
        o.serviceDate >= from &&
        o.status !== 'SKIPPED' &&
        o.status !== 'CANCELLED',
    ) ?? null
  );
}

export function occurrenceDishNames(
  occ: CustomerSubscriptionOccurrence,
  scheduleItems: readonly ScheduleItemLike[],
): string[] {
  const names = new Map(scheduleItems.map(i => [i.menuItemId, i.menuItemName]));
  return occ.items.map(i => names.get(i.menuItemId) || 'Meal');
}

/** Locality and city, e.g. "Madhapur, Hyderabad"; the city alone when no area is known. */
export function addressAreaLine(address: CustomerAddress): string {
  const parts = [address.areaName ?? address.districtName, address.city];
  return [...new Set(parts.filter((part): part is string => Boolean(part)))].join(', ');
}

export function shortSubscriptionId(id: string): string {
  return `CRV-${id.split('-')[0].slice(0, 8).toUpperCase()}`;
}

/** The first item served on or after `startIso`, wrapping to the next week or month; null without items. */
export function firstScheduledItem<T extends ScheduleItemLike>(
  items: readonly T[],
  startIso: string,
): T | null {
  const [year, month, day] = startIso.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  const isoWeekday = start.getUTCDay() || 7;
  const sorted = sortScheduleItems(items);
  return (
    sorted.find(item =>
      item.isoDayOfWeek != null
        ? item.isoDayOfWeek >= isoWeekday
        : (item.dayOfMonth ?? 0) >= start.getUTCDate(),
    ) ??
    sorted[0] ??
    null
  );
}
