// Pure schedule helpers shared by the customer and chef meal-plan screens.
// No Intl and no React: Hermes' Intl support is unreliable, so everything is formatted by hand.

export type MealPlanFoodType = 'VEG' | 'NON_VEG' | 'EGG';

export interface ScheduleItemLike {
  menuItemId: string;
  menuItemName?: string | null;
  menuItemFoodType?: string | null;
  isoDayOfWeek?: number | null;
  dayOfMonth?: number | null;
  mealSlotCode: string;
  serviceTime: string;
  sequenceNumber: number;
  quantity: number;
}

export type BillingUnit = 'week' | '14 days' | '28 days';

export interface PlanScheduleSummary {
  /** Distinct meals in one week (weekday menus) or one month (old date-based menus). */
  mealCount: number;
  /** A weekday menu, which repeats every week of the bill. */
  weekly: boolean;
  slotLabels: string[];
  daysLabel: string | null;
  timeLabel: string | null;
  foodType: MealPlanFoodType | null;
  coverMenuItemId: string | null;
}

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONG_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** 'LATE_NIGHT' -> 'Late Night'. Also used for unknown backend status codes. */
export function titleCaseCode(code: string): string {
  return code
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

export function billingUnit(period: string): BillingUnit {
  switch (period.toUpperCase()) {
    case 'MONTHLY':
      return '28 days';
    case 'FORTNIGHTLY':
      return '14 days';
    default:
      return 'week';
  }
}

export function billingPeriodLabel(period: string): 'Weekly' | '14 days' | 'Monthly' {
  const unit = billingUnit(period);
  return unit === 'week' ? 'Weekly' : unit === '14 days' ? '14 days' : 'Monthly';
}

/** Every bill is whole repeats of the chef's week. */
export function weeksPerBill(unit: BillingUnit): 1 | 2 | 4 {
  return unit === 'week' ? 1 : unit === '14 days' ? 2 : 4;
}

// BREAKFAST, LUNCH, SNACK and DINNER all fall out of title casing.
export function mealSlotLabel(code: string): string {
  return titleCaseCode(code);
}

export function formatServiceTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) {
    return time;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return time;
  }
  return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`;
}

// Weekday menus use isoDayOfWeek (1-7) and start on Sunday; old date-based menus use dayOfMonth. The two never mix.
function dayKey(item: ScheduleItemLike): number {
  return item.isoDayOfWeek != null ? item.isoDayOfWeek % 7 : item.dayOfMonth ?? 0;
}

export function dayLabel(item: ScheduleItemLike, style: 'short' | 'long'): string {
  if (item.isoDayOfWeek != null) {
    return (style === 'long' ? LONG_DAYS : SHORT_DAYS)[item.isoDayOfWeek - 1] ?? '';
  }
  return item.dayOfMonth != null ? `Day ${item.dayOfMonth}` : '';
}

export function sortScheduleItems<T extends ScheduleItemLike>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) => dayKey(a) - dayKey(b) || a.sequenceNumber - b.sequenceNumber,
  );
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function summarizeDays(items: readonly ScheduleItemLike[]): string | null {
  const weekdays = unique(
    items.map(i => i.isoDayOfWeek).filter((d): d is number => d != null),
  ).sort((a, b) => a - b);
  if (weekdays.length > 0) {
    if (weekdays.length === 7) {
      return 'Every day';
    }
    const first = weekdays[0];
    const last = weekdays[weekdays.length - 1];
    return weekdays.length > 1 && last - first === weekdays.length - 1
      ? `${SHORT_DAYS[first - 1]} – ${SHORT_DAYS[last - 1]}`
      : weekdays.map(d => SHORT_DAYS[d - 1]).join(', ');
  }
  const monthDays = unique(
    items.map(i => i.dayOfMonth).filter((d): d is number => d != null),
  ).length;
  return monthDays > 0 ? `${monthDays} ${monthDays === 1 ? 'day' : 'days'} a month` : null;
}

function normalizeFoodType(value?: string | null): MealPlanFoodType | null {
  const normalized = value?.toUpperCase().replace(/[^A-Z]+/g, '_');
  return normalized === 'VEG' || normalized === 'NON_VEG' || normalized === 'EGG'
    ? normalized
    : null;
}

export function summarizeSchedule(
  items: readonly ScheduleItemLike[],
): PlanScheduleSummary {
  const sorted = sortScheduleItems(items);
  const times = unique(sorted.map(i => formatServiceTime(i.serviceTime)));
  const foodTypes = sorted.map(i => normalizeFoodType(i.menuItemFoodType));
  return {
    mealCount: unique(sorted.map(i => `${dayKey(i)}|${i.mealSlotCode}`)).length,
    weekly: sorted.some(i => i.isoDayOfWeek != null),
    slotLabels: unique(sorted.map(i => mealSlotLabel(i.mealSlotCode))),
    daysLabel: summarizeDays(sorted),
    timeLabel: times.length === 1 ? times[0] : null,
    // Most restrictive diet wins so a plan with any non-veg dish is never shown as veg.
    foodType:
      (['NON_VEG', 'EGG', 'VEG'] as const).find(t => foodTypes.includes(t)) ?? null,
    coverMenuItemId: sorted[0]?.menuItemId ?? null,
  };
}

function pluralize(noun: string): string {
  return /(ch|sh|s|x|z)$/.test(noun) ? `${noun}es` : `${noun}s`;
}

/** Meals in one bill: a weekday menu counts once per week of the bill. */
export function formatMealCount(
  summary: PlanScheduleSummary,
  unit: BillingUnit,
): string {
  const count = summary.weekly ? summary.mealCount * weeksPerBill(unit) : summary.mealCount;
  const noun =
    summary.slotLabels.length === 1 ? summary.slotLabels[0].toLowerCase() : 'meal';
  return `${count} ${count === 1 ? noun : pluralize(noun)}`;
}
