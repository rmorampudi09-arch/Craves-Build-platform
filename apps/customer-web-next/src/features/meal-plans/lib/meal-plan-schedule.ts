// Pure schedule helpers, ported from the app's mealPlans/domain/mealPlanSchedule.ts.

export type BillingUnit = "week" | "14 days" | "28 days";

export function billingUnit(period: string): BillingUnit {
  switch (period.toUpperCase()) {
    case "MONTHLY":
      return "28 days";
    case "FORTNIGHTLY":
      return "14 days";
    default:
      return "week";
  }
}

export function billingPeriodLabel(period: string): "Weekly" | "14 days" | "Monthly" {
  const unit = billingUnit(period);
  return unit === "week" ? "Weekly" : unit === "14 days" ? "14 days" : "Monthly";
}

/** Every bill is whole repeats of the chef's week. */
export function weeksPerBill(unit: BillingUnit): 1 | 2 | 4 {
  return unit === "week" ? 1 : unit === "14 days" ? 2 : 4;
}

export type MealPlanFoodType = "VEG" | "NON_VEG" | "EGG";

export type ScheduleItemLike = {
  menuItemId: string;
  foodType?: MealPlanFoodType | null;
  isoDayOfWeek: number | null;
  dayOfMonth: number | null;
  mealSlotCode: string;
  sequenceNumber: number;
};

export type PlanScheduleSummary = {
  /** Distinct meals in one week (weekday menus) or one month (old date-based menus). */
  mealCount: number;
  /** A weekday menu, which repeats every week of the bill. */
  weekly: boolean;
  slotLabels: string[];
  daysLabel: string | null;
  foodType: MealPlanFoodType | null;
  coverMenuItemId: string | null;
};

const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "LATE_NIGHT" -> "Late Night". */
export function mealSlotLabel(code: string): string {
  return code.toLowerCase().split(/[_\s]+/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
}

// Weekday menus use isoDayOfWeek (1-7) and start on Sunday; old date-based menus use dayOfMonth. The two never mix.
function dayKey(item: ScheduleItemLike): number {
  return item.isoDayOfWeek != null ? item.isoDayOfWeek % 7 : item.dayOfMonth ?? 0;
}

export function sortScheduleItems<T extends ScheduleItemLike>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => dayKey(a) - dayKey(b) || a.sequenceNumber - b.sequenceNumber);
}

function summarizeDays(items: readonly ScheduleItemLike[]): string | null {
  const weekdays = [...new Set(items.map(item => item.isoDayOfWeek).filter((day): day is number => day != null))].sort((a, b) => a - b);
  if (weekdays.length > 0) {
    if (weekdays.length === 7) return "Every day";
    const first = weekdays[0];
    const last = weekdays[weekdays.length - 1];
    return weekdays.length > 1 && last - first === weekdays.length - 1
      ? `${SHORT_DAYS[first - 1]} – ${SHORT_DAYS[last - 1]}`
      : weekdays.map(day => SHORT_DAYS[day - 1]).join(", ");
  }
  const monthDays = new Set(items.map(item => item.dayOfMonth).filter(day => day != null)).size;
  return monthDays > 0 ? `${monthDays} ${monthDays === 1 ? "day" : "days"} a month` : null;
}

export function summarizeSchedule(items: readonly ScheduleItemLike[]): PlanScheduleSummary {
  const sorted = sortScheduleItems(items);
  const foodTypes = sorted.map(item => item.foodType);
  return {
    mealCount: new Set(sorted.map(item => `${dayKey(item)}|${item.mealSlotCode}`)).size,
    weekly: sorted.some(item => item.isoDayOfWeek != null),
    slotLabels: [...new Set(sorted.map(item => mealSlotLabel(item.mealSlotCode)))],
    daysLabel: summarizeDays(sorted),
    // Most restrictive diet wins so a plan with any non-veg dish is never shown as veg.
    foodType: (["NON_VEG", "EGG", "VEG"] as const).find(type => foodTypes.includes(type)) ?? null,
    coverMenuItemId: sorted[0]?.menuItemId ?? null,
  };
}

/** "14 meals · Mon – Fri": meals in one bill (a weekday menu counts once per week of the bill) and the days. */
export function mealsAndDays(summary: PlanScheduleSummary, unit: BillingUnit): string {
  const count = summary.weekly ? summary.mealCount * weeksPerBill(unit) : summary.mealCount;
  return [`${count} ${count === 1 ? "meal" : "meals"}`, summary.daysLabel].filter(Boolean).join(" · ");
}
