// Pure state helpers for the chef meal-plan editor. A slot is one meal: a day, a meal slot and one dish.
import type {ChefMealSchedule, PutChefScheduleRequest} from '../api/chefSubscriptionApi';

export type MealSlot = 'BREAKFAST' | 'LUNCH' | 'SNACK' | 'DINNER';
export type BillingPeriod = 'WEEKLY' | 'MONTHLY';

export const MEAL_SLOTS: readonly MealSlot[] = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'];

export const SLOT_DEFAULT_TIME: Record<MealSlot, string> = {
  BREAKFAST: '08:30',
  LUNCH: '12:30',
  SNACK: '16:30',
  DINNER: '19:30',
};

export const LEAD_HOUR_OPTIONS = [1, 2, 4, 6, 12, 24, 48, 72, 168] as const;

/** '06:00' … '23:30' every 30 minutes. */
export const TIME_OPTIONS: readonly string[] = Array.from({length: 36}, (_, index) => {
  const minutes = 6 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 === 0 ? '00' : '30'}`;
});

export interface EditorSlot {
  key: string;
  /** isoDayOfWeek 1–7 for WEEKLY plans, dayOfMonth 1–28 for MONTHLY plans. */
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

export function scheduleToSlots(schedule: ChefMealSchedule): EditorSlot[] {
  // shortcut: slot codes other than the four the app creates are dropped, so a save would remove them; keep them if the backend ever adds more.
  return schedule.items
    .flatMap(item => {
      const day = schedule.recurrenceType === 'MONTHLY' ? item.dayOfMonth : item.isoDayOfWeek;
      if (!day || !isMealSlot(item.mealSlotCode)) {
        return [];
      }
      return [{
        key: item.id,
        day,
        slot: item.mealSlotCode,
        time: item.serviceTime.slice(0, 5),
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      }];
    })
    .sort(bySlotOrder);
}

/** Meals without a dish are left out: the server checks every menu item against the chef's catalog. */
export function slotsToScheduleRequest(
  slots: readonly EditorSlot[],
  period: BillingPeriod,
  leadHours: number,
): PutChefScheduleRequest {
  const sequenceByDay = new Map<number, number>();
  const items = [...slots]
    .filter(slot => slot.menuItemId !== null)
    .sort(bySlotOrder)
    .map(slot => {
      const sequenceNumber = (sequenceByDay.get(slot.day) ?? 0) + 1;
      sequenceByDay.set(slot.day, sequenceNumber);
      return {
        menuItemId: slot.menuItemId as string,
        quantity: slot.quantity,
        isoDayOfWeek: period === 'WEEKLY' ? slot.day : null,
        dayOfMonth: period === 'MONTHLY' ? slot.day : null,
        mealSlotCode: slot.slot,
        serviceTime: slot.time,
        sequenceNumber,
      };
    });
  return {recurrenceType: period, timezone: 'Asia/Kolkata', generationLeadHours: leadHours, items};
}

export function addSlot(slots: readonly EditorSlot[], day: number, slot: MealSlot): EditorSlot[] {
  if (slots.some(existing => existing.day === day && existing.slot === slot)) {
    return [...slots];
  }
  const time = slots.find(existing => existing.slot === slot)?.time ?? SLOT_DEFAULT_TIME[slot];
  return [...slots, {key: `${day}-${slot}`, day, slot, time, menuItemId: null, quantity: 1}].sort(bySlotOrder);
}

export function removeSlot(slots: readonly EditorSlot[], key: string): EditorSlot[] {
  return slots.filter(slot => slot.key !== key);
}

/** Every meal in one slot shares one service time on the server, so this changes that slot on every day. */
export function setSlotTime(slots: readonly EditorSlot[], slot: MealSlot, time: string): EditorSlot[] {
  return slots.map(existing => (existing.slot === slot ? {...existing, time} : existing));
}

export function setSlotDish(slots: readonly EditorSlot[], key: string, menuItemId: string): EditorSlot[] {
  return slots.map(slot => (slot.key === key ? {...slot, menuItemId} : slot));
}

export function setSlotQuantity(slots: readonly EditorSlot[], key: string, quantity: number): EditorSlot[] {
  const clamped = Math.min(100, Math.max(1, Math.round(quantity)));
  return slots.map(slot => (slot.key === key ? {...slot, quantity: clamped} : slot));
}

export function daysWithMeals(slots: readonly EditorSlot[]): Set<number> {
  return new Set(slots.map(slot => slot.day));
}

export function freeSlotsForDay(slots: readonly EditorSlot[], day: number): MealSlot[] {
  return MEAL_SLOTS.filter(code => !slots.some(slot => slot.day === day && slot.slot === code));
}

export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAYS_MON_TO_FRI = [1, 2, 3, 4, 5];

export const dayName = (period: BillingPeriod, day: number, style: 'short' | 'long' = 'short') =>
  period === 'WEEKLY' ? (style === 'long' ? WEEKDAYS_LONG : WEEKDAYS_SHORT)[day - 1] : `Day ${day}`;

/** Gives Monday to Friday (except `day`) the meals of `day`, replacing what they had; the weekend is left alone. */
export function copyDayToWeekdays(slots: readonly EditorSlot[], day: number): EditorSlot[] {
  const targets = WEEKDAYS_MON_TO_FRI.filter(target => target !== day);
  const copies = targets.flatMap(target =>
    slots.filter(slot => slot.day === day).map(slot => ({...slot, day: target, key: `${target}-${slot.slot}`})),
  );
  return [...slots.filter(slot => !targets.includes(slot.day)), ...copies].sort(bySlotOrder);
}

export function otherWeekdaysHaveMeals(slots: readonly EditorSlot[], day: number): boolean {
  return slots.some(slot => slot.day !== day && WEEKDAYS_MON_TO_FRI.includes(slot.day));
}

/** Days with exactly the same meals (slot, time, dish, quantity), for the review step. Groups follow day order. */
export function groupMealDays(slots: readonly EditorSlot[]): {days: number[]; meals: EditorSlot[]}[] {
  const groups = new Map<string, {days: number[]; meals: EditorSlot[]}>();
  for (const day of [...daysWithMeals(slots)].sort((a, b) => a - b)) {
    const meals = slots.filter(slot => slot.day === day).sort(bySlotOrder);
    const signature = meals.map(meal => `${meal.slot}|${meal.time}|${meal.menuItemId}|${meal.quantity}`).join(';');
    const group = groups.get(signature);
    if (group) {
      group.days.push(day);
    } else {
      groups.set(signature, {days: [day], meals});
    }
  }
  return [...groups.values()];
}

/** "Mon, Wed – Fri, Sun"; monthly plans read "Day 1 – 3, 15". */
export function dayRangeLabel(period: BillingPeriod, days: readonly number[]): string {
  const runs: number[][] = [];
  for (const day of [...days].sort((a, b) => a - b)) {
    const run = runs[runs.length - 1];
    if (run && day === run[run.length - 1] + 1) {
      run.push(day);
    } else {
      runs.push([day]);
    }
  }
  const names = runs.map(run => {
    const [first, last] = [run[0], run[run.length - 1]];
    const label = (day: number) => (period === 'WEEKLY' ? WEEKDAYS_SHORT[day - 1] : String(day));
    return first === last ? label(first) : `${label(first)} – ${label(last)}`;
  });
  return period === 'WEEKLY' ? names.join(', ') : `Day ${names.join(', ')}`;
}

/** "Add breakfast, snack or dinner": the meals a day can still take; "Add a meal" while it has none. */
export function addMealLabel(free: readonly MealSlot[]): string {
  if (free.length === MEAL_SLOTS.length) {
    return 'Add a meal';
  }
  const names = free.map(code => code.toLowerCase());
  return `Add ${names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0]}`;
}

/** 1 for a problem in the plan's details, 2 for one in the meals, null when there is none. */
export function stepWithErrors(errors: Record<string, string>): 1 | 2 | null {
  const keys = Object.keys(errors);
  if (keys.some(key => key === 'name' || key === 'description' || key === 'amount')) {
    return 1;
  }
  return keys.length > 0 ? 2 : null;
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
  mode: 'draft' | 'submit',
): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  const description = form.description.trim();
  const amount = Number(form.amount.trim());
  if (!name) {
    errors.name = 'Enter a plan name.';
  } else if (name.length > 160) {
    errors.name = 'Keep the name to 160 characters.';
  }
  if (!description) {
    errors.description = 'Add a short description.';
  } else if (description.length > 500) {
    errors.description = 'Keep the description to 500 characters.';
  }
  if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Enter a price above ₹0.';
  }
  if (mode === 'submit') {
    if (slots.length === 0) {
      errors.schedule = 'Add at least one meal before submitting.';
    }
    for (const slot of slots) {
      if (slot.menuItemId === null) {
        errors[`slot:${slot.key}`] = 'Select a dish.';
      }
    }
  }
  return errors;
}
