// Pure meal-plan helpers for the chef's plan list and editor, ported from the app. A slot is one meal: a day, a meal and one dish.
import type {
  ChefMealPlan,
  ChefMealPlanPeriod,
  ChefMealSchedule,
  ChefMealScheduleInput,
} from "./chef-subscription-plan-contract.ts";

export type MealSlot = "BREAKFAST" | "LUNCH" | "SNACK" | "DINNER";
/** Every new plan is one weekday menu; date-based (MONTHLY) schedules only appear on plans already live. */
export type ScheduleKind = "WEEKLY" | "MONTHLY";

export const MEAL_SLOTS: readonly MealSlot[] = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"];
/** ISO weekdays in the order chefs fill them in: Sunday first. */
export const WEEK_ORDER: readonly number[] = [7, 1, 2, 3, 4, 5, 6];
const weekPosition = (day: number) => day % 7;
const WEEKDAYS_MON_TO_FRI = [1, 2, 3, 4, 5];
export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const SLOT_DEFAULT_TIME: Record<MealSlot, string> = {
  BREAKFAST: "08:30",
  LUNCH: "12:30",
  SNACK: "16:30",
  DINNER: "19:30",
};
export const LEAD_HOUR_OPTIONS = [1, 2, 4, 6, 12, 24, 48, 72, 168] as const;
/** '06:00' … '23:30' every 30 minutes. */
export const TIME_OPTIONS: readonly string[] = Array.from({ length: 36 }, (_, index) => {
  const minutes = 6 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 === 0 ? "00" : "30"}`;
});
export const NAME_MAX = 160;
export const DESCRIPTION_MAX = 500;
export const NOTE_MAX = 1000;

export interface EditorSlot {
  key: string;
  /** isoDayOfWeek 1–7 for weekday menus, dayOfMonth 1–28 for old date-based menus. */
  day: number;
  slot: MealSlot;
  /** 'HH:mm' */
  time: string;
  menuItemId: string | null;
  quantity: number;
}

const bySlotOrder = (a: EditorSlot, b: EditorSlot) =>
  a.day - b.day || MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot);
const isMealSlot = (code: string): code is MealSlot => MEAL_SLOTS.includes(code as MealSlot);

// ---------- Words ----------

/** 'BREAKFAST' -> 'Breakfast'. */
export const mealSlotLabel = (code: string) =>
  code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ");

/** '19:30' -> '7:30 PM'. */
export function formatServiceTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
  const hours = Number(match?.[1]);
  if (!match || hours > 23 || Number(match[2]) > 59) return time;
  return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}

export function billingUnit(period: ChefMealPlanPeriod): "week" | "14 days" | "28 days" {
  return period === "MONTHLY" ? "28 days" : period === "FORTNIGHTLY" ? "14 days" : "week";
}
export const billingPeriodLabel = (period: ChefMealPlanPeriod) =>
  period === "MONTHLY" ? "Monthly" : period === "FORTNIGHTLY" ? "14 days" : "Weekly";

export function repeatsLabel(period: ChefMealPlanPeriod): string {
  if (period === "FORTNIGHTLY") return "This week repeats 2 times in each 14-day bill.";
  if (period === "MONTHLY") return "This week repeats 4 times in each 28-day bill.";
  return "Customers get this week each bill.";
}

export const leadHoursLabel = (hours: number) =>
  hours === 24 ? "24 hours before (default)" : `${hours} ${hours === 1 ? "hour" : "hours"} before`;

export const dayName = (kind: ScheduleKind, day: number, style: "short" | "long" = "short") =>
  kind === "WEEKLY" ? (style === "long" ? WEEKDAYS_LONG : WEEKDAYS_SHORT)[day - 1] : `Day ${day}`;

/** ₹1,499, or ₹1,499.50 when there are paise. */
export function formatPlanPrice(amount: number | string, currency: string): string {
  const prefix = currency === "INR" ? "₹" : `${currency} `;
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${prefix}${amount}`;
  const [whole, paise] = Math.abs(value).toFixed(2).split(".");
  return `${value < 0 ? "-" : ""}${prefix}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${paise === "00" ? "" : `.${paise}`}`;
}

export const chefPlanPriceLabel = (
  plan: Pick<ChefMealPlan, "amount" | "currency" | "billingPeriod">,
) => `${formatPlanPrice(plan.amount, plan.currency)} / ${billingUnit(plan.billingPeriod)}`;

/** "Sun – Mon, Wed – Fri" (the week starts on Sunday); date-based menus read "Day 1 – 3, 15". */
export function dayRangeLabel(kind: ScheduleKind, days: readonly number[]): string {
  const order = kind === "WEEKLY" ? weekPosition : (day: number) => day;
  const runs: number[][] = [];
  for (const day of [...days].sort((a, b) => order(a) - order(b))) {
    const run = runs[runs.length - 1];
    if (run && order(day) === order(run[run.length - 1]) + 1) run.push(day);
    else runs.push([day]);
  }
  const label = (day: number) => (kind === "WEEKLY" ? WEEKDAYS_SHORT[day - 1] : String(day));
  const names = runs.map((run) =>
    run.length === 1 ? label(run[0]) : `${label(run[0])} – ${label(run[run.length - 1])}`,
  );
  return kind === "WEEKLY" ? names.join(", ") : `Day ${names.join(", ")}`;
}

/** "Add breakfast, snack or dinner": the meals a day can still take; "Add a meal" while it has none. */
export function addMealLabel(free: readonly MealSlot[]): string {
  if (free.length === MEAL_SLOTS.length) return "Add a meal";
  const names = free.map((code) => code.toLowerCase());
  return `Add ${names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0]}`;
}

// ---------- Plan list ----------

export type ChefPlanFilter = "ALL" | "LIVE" | "WAITING" | "DRAFTS";
export type ChefPlanTone = "warning" | "active" | "success" | "attention" | "muted";

const STATUS: Record<ChefMealPlan["status"], { label: string; tone: ChefPlanTone }> = {
  DRAFT: { label: "Draft", tone: "warning" },
  PENDING_APPROVAL: { label: "Waiting approval", tone: "active" },
  ACTIVE: { label: "Live", tone: "success" },
  REJECTED: { label: "Changes requested", tone: "attention" },
  INACTIVE: { label: "Inactive", tone: "muted" },
};
export const chefPlanStatus = (status: ChefMealPlan["status"]) => STATUS[status];

const FILTER_STATUSES: Record<Exclude<ChefPlanFilter, "ALL">, ChefMealPlan["status"][]> = {
  LIVE: ["ACTIVE"],
  WAITING: ["PENDING_APPROVAL"],
  DRAFTS: ["DRAFT", "REJECTED"],
};

/** Inactive plans show only under All; a plan Craves sent back for changes is still the chef's draft to fix. */
export function filterChefPlans<T extends Pick<ChefMealPlan, "status">>(
  plans: readonly T[],
  filter: ChefPlanFilter,
): T[] {
  return filter === "ALL"
    ? [...plans]
    : plans.filter((plan) => FILTER_STATUSES[filter].includes(plan.status));
}

export function chefPlanCounts(
  plans: readonly Pick<ChefMealPlan, "status">[],
): Record<ChefPlanFilter, number> {
  return {
    ALL: plans.length,
    LIVE: filterChefPlans(plans, "LIVE").length,
    WAITING: filterChefPlans(plans, "WAITING").length,
    DRAFTS: filterChefPlans(plans, "DRAFTS").length,
  };
}

type ScheduleItemLike = Pick<
  ChefMealSchedule["items"][number],
  "isoDayOfWeek" | "dayOfMonth" | "mealSlotCode" | "sequenceNumber"
>;

function daysSummary(items: readonly ScheduleItemLike[]): string | null {
  const weekdays = [
    ...new Set(items.flatMap((item) => (item.isoDayOfWeek ? [item.isoDayOfWeek] : []))),
  ].sort((a, b) => a - b);
  if (weekdays.length === 7) return "every day";
  if (weekdays.length > 0) {
    const [first, last] = [weekdays[0], weekdays[weekdays.length - 1]];
    return weekdays.length > 1 && last - first === weekdays.length - 1
      ? `${WEEKDAYS_SHORT[first - 1]} – ${WEEKDAYS_SHORT[last - 1]}`
      : weekdays.map((day) => WEEKDAYS_SHORT[day - 1]).join(", ");
  }
  const monthDays = new Set(items.flatMap((item) => (item.dayOfMonth ? [item.dayOfMonth] : [])))
    .size;
  return monthDays > 0 ? `${monthDays} ${monthDays === 1 ? "day" : "days"} a month` : null;
}

/** Meals in serving order: weekday menus start on Sunday; old date-based menus go by date. The first is the plan's cover. */
export function sortScheduleItems<T extends ScheduleItemLike>(items: readonly T[]): T[] {
  const dayKey = (item: ScheduleItemLike) =>
    item.isoDayOfWeek ? item.isoDayOfWeek % 7 : (item.dayOfMonth ?? 0);
  return [...items].sort((a, b) => dayKey(a) - dayKey(b) || a.sequenceNumber - b.sequenceNumber);
}

/** "Weekly · Lunch, Dinner · Mon – Fri"; just the frequency while the schedule is empty or not loaded. */
export function chefPlanMetaLine(
  period: ChefMealPlanPeriod,
  items: readonly ScheduleItemLike[] | undefined,
): string {
  const parts = [billingPeriodLabel(period)];
  if (items?.length) {
    const sorted = sortScheduleItems(items);
    parts.push([...new Set(sorted.map((item) => mealSlotLabel(item.mealSlotCode)))].join(", "));
    const days = daysSummary(items);
    if (days) parts.push(days);
  }
  return parts.join(" · ");
}

/** "8 subscribers"; null until the backend sends the count. */
export function subscriberCountLabel(count: number | null): string | null {
  return count === null ? null : `${count} ${count === 1 ? "subscriber" : "subscribers"}`;
}

/** The switch position, or null when the switch must be hidden (not live, or an older backend without the field). */
export function acceptingSubscribersValue(
  plan: Pick<ChefMealPlan, "status" | "acceptingSubscribers">,
): boolean | null {
  return plan.status === "ACTIVE" ? plan.acceptingSubscribers : null;
}

// ---------- Editor ----------

export function scheduleToSlots(
  schedule: Pick<ChefMealSchedule, "recurrenceType" | "items">,
): EditorSlot[] {
  // shortcut: slot codes other than the four the app creates are dropped, so a save would remove them; keep them if the backend ever adds more.
  return schedule.items
    .flatMap((item) => {
      const day = schedule.recurrenceType === "MONTHLY" ? item.dayOfMonth : item.isoDayOfWeek;
      if (!day || !isMealSlot(item.mealSlotCode)) return [];
      return [
        {
          key: item.id,
          day,
          slot: item.mealSlotCode,
          time: item.serviceTime.slice(0, 5),
          menuItemId: item.menuItemId,
          quantity: item.quantity,
        },
      ];
    })
    .sort(bySlotOrder);
}

/** One week of meals, whatever the bill length. Meals without a dish are left out: the server checks every dish. */
export function slotsToScheduleRequest(
  slots: readonly EditorSlot[],
  leadHours: number,
): ChefMealScheduleInput {
  const sequenceByDay = new Map<number, number>();
  const items = slots
    .filter((slot) => slot.menuItemId !== null)
    .sort(bySlotOrder)
    .map((slot) => {
      const sequenceNumber = (sequenceByDay.get(slot.day) ?? 0) + 1;
      sequenceByDay.set(slot.day, sequenceNumber);
      return {
        menuItemId: slot.menuItemId as string,
        quantity: slot.quantity,
        isoDayOfWeek: slot.day,
        dayOfMonth: null,
        mealSlotCode: slot.slot,
        serviceTime: slot.time,
        sequenceNumber,
      };
    });
  return {
    recurrenceType: "WEEKLY",
    timezone: "Asia/Kolkata",
    generationLeadHours: leadHours,
    items,
  };
}

/** A live plan set up by date still shows its dates; an editable one starts again as one week. */
export function editorScheduleKind(
  editable: boolean,
  schedule: Pick<ChefMealSchedule, "recurrenceType"> | null,
): ScheduleKind {
  return !editable && schedule?.recurrenceType === "MONTHLY" ? "MONTHLY" : "WEEKLY";
}

export function initialSlots(
  editable: boolean,
  schedule: Pick<ChefMealSchedule, "recurrenceType" | "items"> | null,
): EditorSlot[] {
  return !schedule || (editable && schedule.recurrenceType !== "WEEKLY")
    ? []
    : scheduleToSlots(schedule);
}

export function addSlot(slots: readonly EditorSlot[], day: number, slot: MealSlot): EditorSlot[] {
  if (slots.some((existing) => existing.day === day && existing.slot === slot)) return [...slots];
  const time = slots.find((existing) => existing.slot === slot)?.time ?? SLOT_DEFAULT_TIME[slot];
  return [...slots, { key: `${day}-${slot}`, day, slot, time, menuItemId: null, quantity: 1 }].sort(
    bySlotOrder,
  );
}

export const removeSlot = (slots: readonly EditorSlot[], key: string) =>
  slots.filter((slot) => slot.key !== key);

/** Every meal in one slot shares one service time on the server, so this changes that slot on every day. */
export const setSlotTime = (slots: readonly EditorSlot[], slot: MealSlot, time: string) =>
  slots.map((existing) => (existing.slot === slot ? { ...existing, time } : existing));

export const setSlotDish = (slots: readonly EditorSlot[], key: string, menuItemId: string) =>
  slots.map((slot) => (slot.key === key ? { ...slot, menuItemId } : slot));

export function setSlotQuantity(
  slots: readonly EditorSlot[],
  key: string,
  quantity: number,
): EditorSlot[] {
  const clamped = Math.min(100, Math.max(1, Math.round(quantity)));
  return slots.map((slot) => (slot.key === key ? { ...slot, quantity: clamped } : slot));
}

export const daysWithMeals = (slots: readonly EditorSlot[]) =>
  new Set(slots.map((slot) => slot.day));

export const freeSlotsForDay = (slots: readonly EditorSlot[], day: number) =>
  MEAL_SLOTS.filter((code) => !slots.some((slot) => slot.day === day && slot.slot === code));

/** Gives Monday to Friday (except `day`) the meals of `day`, replacing what they had; the weekend is left alone. */
export function copyDayToWeekdays(slots: readonly EditorSlot[], day: number): EditorSlot[] {
  const targets = WEEKDAYS_MON_TO_FRI.filter((target) => target !== day);
  const copies = targets.flatMap((target) =>
    slots
      .filter((slot) => slot.day === day)
      .map((slot) => ({ ...slot, day: target, key: `${target}-${slot.slot}` })),
  );
  return [...slots.filter((slot) => !targets.includes(slot.day)), ...copies].sort(bySlotOrder);
}

export const otherWeekdaysHaveMeals = (slots: readonly EditorSlot[], day: number) =>
  slots.some((slot) => slot.day !== day && WEEKDAYS_MON_TO_FRI.includes(slot.day));

/** Days with exactly the same meals (slot, time, dish, quantity), for the review step. Groups follow day order. */
export function groupMealDays(
  slots: readonly EditorSlot[],
  kind: ScheduleKind = "WEEKLY",
): { days: number[]; meals: EditorSlot[] }[] {
  const groups = new Map<string, { days: number[]; meals: EditorSlot[] }>();
  const order = kind === "WEEKLY" ? weekPosition : (day: number) => day;
  for (const day of [...daysWithMeals(slots)].sort((a, b) => order(a) - order(b))) {
    const meals = slots.filter((slot) => slot.day === day).sort(bySlotOrder);
    const signature = meals
      .map((meal) => `${meal.slot}|${meal.time}|${meal.menuItemId}|${meal.quantity}`)
      .join(";");
    const group = groups.get(signature);
    if (group) group.days.push(day);
    else groups.set(signature, { days: [day], meals });
  }
  return [...groups.values()];
}

export interface MealPlanFormValues {
  name: string;
  description: string;
  amount: string;
}

/** Field errors keyed by 'name' | 'description' | 'amount' | 'schedule' | `slot:${key}`; empty when valid. */
export function validateMealPlanForm(
  form: MealPlanFormValues,
  slots: readonly EditorSlot[],
  mode: "draft" | "submit",
): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  const description = form.description.trim();
  const amount = Number(form.amount.trim());
  if (!name) errors.name = "Enter a plan name.";
  else if (name.length > NAME_MAX) errors.name = "Keep the name to 160 characters.";
  if (!description) errors.description = "Add a short description.";
  else if (description.length > DESCRIPTION_MAX)
    errors.description = "Keep the description to 500 characters.";
  if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0)
    errors.amount = "Enter a price above ₹0.";
  if (mode === "submit") {
    if (slots.length === 0) errors.schedule = "Add at least one meal before submitting.";
    for (const slot of slots)
      if (slot.menuItemId === null) errors[`slot:${slot.key}`] = "Select a dish.";
  }
  return errors;
}

/** 1 for a problem in the plan's details, 2 for one in the meals, null when there is none. */
export function stepWithErrors(errors: Record<string, string>): 1 | 2 | null {
  const keys = Object.keys(errors);
  if (keys.some((key) => key === "name" || key === "description" || key === "amount")) return 1;
  return keys.length > 0 ? 2 : null;
}
