import type {
  ChefCapacityDateOverride,
  ChefMealSchedule,
  ChefMenuItemCapacityRule,
  ChefMenuItemDateOverride,
  ChefSlotCapacityRule,
} from '../api/chefSubscriptionApi';
import {
  capacityBar,
  capacityCaption,
  clampPlates,
  dateChangeLines,
  DEFAULT_SUBSCRIBER_PLATES,
  DEFAULT_TOTAL_PLATES,
  dishLimitSummary,
  dishLimits,
  firstServedSlot,
  limitDays,
  limitHeading,
  MAX_PLATES,
  setSubscriberPlates,
  setTotalPlates,
  slotLimits,
} from './chefDailyLimits';

const DISH_A = '44444444-4444-4444-8444-444444444444';
const DISH_B = '55555555-5555-4555-8555-555555555555';

const schedule = (days: number[], slot = 'LUNCH', recurrenceType: 'WEEKLY' | 'MONTHLY' = 'WEEKLY') =>
  ({
    recurrenceType,
    items: days.map(day => ({
      isoDayOfWeek: recurrenceType === 'WEEKLY' ? day : null,
      dayOfMonth: recurrenceType === 'MONTHLY' ? day : null,
      mealSlotCode: slot,
    })),
  }) as unknown as ChefMealSchedule;

const slotRule = (fields: Partial<ChefSlotCapacityRule>) =>
  ({
    isoDayOfWeek: 1,
    mealSlotCode: 'LUNCH',
    totalCapacityUnits: 30,
    subscriptionCapacityUnits: 12,
    salesEnabled: true,
    recurringReservedUnits: 5,
    recurringAvailableUnits: 7,
    recurringDeficitUnits: 0,
    ...fields,
  }) as ChefSlotCapacityRule;

describe('limitDays', () => {
  it('is every day the plans serve that meal', () => {
    expect(limitDays([schedule([3, 1, 2]), schedule([2, 5])], 'LUNCH')).toEqual([1, 2, 3, 5]);
    expect(limitDays([schedule([1, 2], 'DINNER')], 'LUNCH')).toEqual([1, 2, 3, 4, 5]);
  });

  it('falls back to Monday to Friday when nothing is known, and ignores monthly plans', () => {
    expect(limitDays([], 'LUNCH')).toEqual([1, 2, 3, 4, 5]);
    expect(limitDays([schedule([5, 12], 'LUNCH', 'MONTHLY')], 'LUNCH')).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('firstServedSlot', () => {
  it('opens on the first meal the plans serve, else Lunch', () => {
    expect(firstServedSlot([schedule([1], 'DINNER'), schedule([1], 'SNACK')])).toBe('SNACK');
    expect(firstServedSlot([])).toBe('LUNCH');
  });
});

describe('limitHeading', () => {
  it('names the days in plain words', () => {
    expect(limitHeading('LUNCH', [1, 2, 3, 4, 5])).toBe('Every weekday lunch');
    expect(limitHeading('DINNER', [1, 2, 3, 4, 5, 6, 7])).toBe('Every dinner');
    expect(limitHeading('LUNCH', [1, 3, 4])).toBe('Lunch on Mon, Wed – Thu');
  });
});

describe('slotLimits', () => {
  it('reads the first day that has a rule', () => {
    const rules = [slotRule({isoDayOfWeek: 3}), slotRule({isoDayOfWeek: 2, totalCapacityUnits: 40, subscriptionCapacityUnits: 15, recurringReservedUnits: 9, recurringDeficitUnits: 2})];

    expect(slotLimits(rules, 'LUNCH', [1, 2, 3])).toEqual({total: 40, subscriber: 15, salesEnabled: true, booked: 9, deficit: 2, mixed: true});
  });

  it('ignores other meals and days, and starts from 20 and 10 when no rule exists', () => {
    expect(slotLimits([slotRule({mealSlotCode: 'DINNER'}), slotRule({isoDayOfWeek: 6})], 'LUNCH', [1, 2])).toEqual({
      total: DEFAULT_TOTAL_PLATES,
      subscriber: DEFAULT_SUBSCRIBER_PLATES,
      salesEnabled: true,
      booked: 0,
      deficit: 0,
      mixed: false,
    });
  });

  it('says the days differ when their saved limits are not the same, so a save would overwrite some', () => {
    const same = [slotRule({isoDayOfWeek: 1}), slotRule({isoDayOfWeek: 2})];
    expect(slotLimits(same, 'LUNCH', [1, 2, 3]).mixed).toBe(false);
    expect(slotLimits([slotRule({isoDayOfWeek: 1}), slotRule({isoDayOfWeek: 6, totalCapacityUnits: 10})], 'LUNCH', [1, 6]).mixed).toBe(true);
    expect(slotLimits([...same, slotRule({isoDayOfWeek: 3, subscriptionCapacityUnits: 5})], 'LUNCH', [1, 2, 3]).mixed).toBe(true);
    expect(slotLimits([...same, slotRule({isoDayOfWeek: 3, salesEnabled: false})], 'LUNCH', [1, 2, 3]).mixed).toBe(true);
    // Only the days a save would write count, and days with no rule yet have nothing to overwrite.
    expect(slotLimits([...same, slotRule({isoDayOfWeek: 6, totalCapacityUnits: 10})], 'LUNCH', [1, 2, 3]).mixed).toBe(false);
  });

  it('keeps a rule that has switched subscriptions off', () => {
    expect(slotLimits([slotRule({salesEnabled: false})], 'LUNCH', [1]).salesEnabled).toBe(false);
  });
});

describe('dishLimits', () => {
  const rule = (fields: Record<string, unknown>) =>
    ({isoDayOfWeek: 1, mealSlotCode: 'LUNCH', menuItemId: DISH_A, maxSubscriptionUnits: 10, salesEnabled: true, ...fields}) as unknown as ChefMenuItemCapacityRule;

  it('reads the first day that has a limit for the dish, and flags days that differ', () => {
    const rules = [rule({isoDayOfWeek: 2, maxSubscriptionUnits: 4}), rule({isoDayOfWeek: 1, maxSubscriptionUnits: 8}), rule({menuItemId: DISH_B, isoDayOfWeek: 1})];

    expect(dishLimits(rules, DISH_A, 'LUNCH', [1, 2])).toEqual({max: 8, salesEnabled: true, mixed: true});
    expect(dishLimits(rules, DISH_A, 'LUNCH', [1])).toEqual({max: 8, salesEnabled: true, mixed: false});
  });

  it('is null while the dish has no limit for that meal', () => {
    expect(dishLimits([rule({mealSlotCode: 'DINNER'})], DISH_A, 'LUNCH', [1])).toBeNull();
    expect(dishLimits([], DISH_A, 'LUNCH', [1])).toBeNull();
  });
});

describe('clampPlates', () => {
  it('keeps a plate count whole and between 0 and the most the server accepts', () => {
    expect(clampPlates(-4)).toBe(0);
    expect(clampPlates(12.6)).toBe(13);
    expect(clampPlates(999999)).toBe(MAX_PLATES);
  });
});

describe('the plate steppers', () => {
  it('never let kept-for-subscribers go above the total', () => {
    expect(setTotalPlates({total: 20, subscriber: 10}, 6)).toEqual({total: 6, subscriber: 6});
    expect(setTotalPlates({total: 20, subscriber: 10}, 25)).toEqual({total: 25, subscriber: 10});
    expect(setSubscriberPlates({total: 20, subscriber: 10}, 30)).toEqual({total: 20, subscriber: 20});
  });

  it('stay between 0 and the most the server accepts', () => {
    expect(setTotalPlates({total: 20, subscriber: 0}, -3).total).toBe(0);
    expect(setTotalPlates({total: 20, subscriber: 0}, 999999).total).toBe(MAX_PLATES);
    expect(setSubscriberPlates({total: 20, subscriber: 5}, -1).subscriber).toBe(0);
  });
});

describe('capacityBar', () => {
  it('splits the total into booked, free for subscribers and normal orders', () => {
    const bar = capacityBar({total: 20, subscriber: 10}, 8);

    expect(bar).toEqual({booked: 8, free: 2, normal: 10});
    expect(capacityCaption(bar)).toBe('8 subscriber plates booked · 2 free · 10 for normal orders');
  });

  it('never draws more booked plates than the subscriber limit', () => {
    expect(capacityBar({total: 20, subscriber: 4}, 9)).toEqual({booked: 4, free: 0, normal: 16});
  });
});

describe('dishLimitSummary', () => {
  const dishRule = (fields: Partial<ChefMenuItemCapacityRule>) =>
    ({isoDayOfWeek: 1, mealSlotCode: 'LUNCH', menuItemId: DISH_A, maxSubscriptionUnits: 10, salesEnabled: true, ...fields}) as ChefMenuItemCapacityRule;
  const name = (id: string) => (id === DISH_A ? 'Chicken curry' : 'Lemon rice');

  it('says no limits while there are none for that meal', () => {
    expect(dishLimitSummary([], 'LUNCH', [1], name)).toBe('No limits set');
    expect(dishLimitSummary([dishRule({mealSlotCode: 'DINNER'})], 'LUNCH', [1], name)).toBe('No limits set');
  });

  it('shows the first dish, and how many more there are', () => {
    expect(dishLimitSummary([dishRule({})], 'LUNCH', [1], name)).toBe('Chicken curry: max 10 a day');
    expect(
      dishLimitSummary([dishRule({}), dishRule({isoDayOfWeek: 2}), dishRule({menuItemId: DISH_B, maxSubscriptionUnits: 5})], 'LUNCH', [1, 2], name),
    ).toBe('Chicken curry: max 10 a day · +1 more');
  });
});

describe('dateChangeLines', () => {
  const today = new Date(2026, 9, 13, 10, 0);
  const slotChange = (fields: Partial<ChefCapacityDateOverride>) =>
    ({serviceDate: '2026-10-25', mealSlotCode: 'LUNCH', totalCapacityUnits: 15, subscriptionCapacityUnits: 5, closed: false, ...fields}) as ChefCapacityDateOverride;
  const dishChange = (fields: Partial<ChefMenuItemDateOverride>) =>
    ({serviceDate: '2026-10-20', mealSlotCode: 'LUNCH', menuItemId: DISH_A, maxSubscriptionUnits: 4, closed: false, ...fields}) as ChefMenuItemDateOverride;

  it('lists upcoming changes for the meal, soonest first, in plain words', () => {
    const lines = dateChangeLines(
      [slotChange({}), slotChange({serviceDate: '2026-10-14', closed: true})],
      [dishChange({}), dishChange({serviceDate: '2026-10-21', closed: true, menuItemId: DISH_B})],
      'LUNCH',
      today,
      id => (id === DISH_A ? 'Chicken curry' : 'Lemon rice'),
    );

    expect(lines).toEqual([
      'Tomorrow · closed',
      'Tue 20 Oct · Chicken curry: max 4',
      'Wed 21 Oct · Lemon rice: closed',
      'Sun 25 Oct · 15 plates, 5 for subscribers',
    ]);
  });

  it('leaves out other meals and dates that have passed', () => {
    expect(
      dateChangeLines([slotChange({mealSlotCode: 'DINNER'}), slotChange({serviceDate: '2026-10-01'})], [], 'LUNCH', today, () => ''),
    ).toEqual([]);
  });
});
