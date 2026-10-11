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
