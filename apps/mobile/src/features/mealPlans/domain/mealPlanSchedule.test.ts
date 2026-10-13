import {
  billingUnit,
  dayLabel,
  formatMealCount,
  formatServiceTime,
  mealSlotLabel,
  sortScheduleItems,
  summarizeSchedule,
  type ScheduleItemLike,
} from './mealPlanSchedule';

function item(over: Partial<ScheduleItemLike> = {}): ScheduleItemLike {
  return {
    menuItemId: 'm1',
    menuItemName: 'Dal Tadka',
    menuItemFoodType: 'VEG',
    isoDayOfWeek: 1,
    dayOfMonth: null,
    mealSlotCode: 'LUNCH',
    serviceTime: '12:30:00',
    sequenceNumber: 1,
    quantity: 1,
    ...over,
  };
}

function weekdays(days: number[], over: Partial<ScheduleItemLike> = {}) {
  return days.map(d => item({isoDayOfWeek: d, menuItemId: `m${d}`, ...over}));
}

describe('billingUnit', () => {
  it('maps MONTHLY to month and everything else to week', () => {
    expect(billingUnit('MONTHLY')).toBe('month');
    expect(billingUnit('WEEKLY')).toBe('week');
    expect(billingUnit('anything')).toBe('week');
  });
});

describe('mealSlotLabel', () => {
  it('labels known slots and title-cases the rest', () => {
    expect(mealSlotLabel('BREAKFAST')).toBe('Breakfast');
    expect(mealSlotLabel('LUNCH')).toBe('Lunch');
    expect(mealSlotLabel('SNACK')).toBe('Snack');
    expect(mealSlotLabel('DINNER')).toBe('Dinner');
    expect(mealSlotLabel('LATE_NIGHT')).toBe('Late Night');
  });
});

describe('formatServiceTime', () => {
  it('formats 24h times as 12h with AM/PM', () => {
    expect(formatServiceTime('12:30')).toBe('12:30 PM');
    expect(formatServiceTime('12:30:00')).toBe('12:30 PM');
    expect(formatServiceTime('08:30')).toBe('8:30 AM');
    expect(formatServiceTime('00:15')).toBe('12:15 AM');
    expect(formatServiceTime('23:59:00')).toBe('11:59 PM');
  });

  it('returns unparseable input unchanged', () => {
    expect(formatServiceTime('noon')).toBe('noon');
  });
});

describe('dayLabel', () => {
  it('labels ISO weekdays', () => {
    expect(dayLabel(item({isoDayOfWeek: 1}), 'short')).toBe('Mon');
    expect(dayLabel(item({isoDayOfWeek: 1}), 'long')).toBe('Monday');
    expect(dayLabel(item({isoDayOfWeek: 7}), 'short')).toBe('Sun');
    expect(dayLabel(item({isoDayOfWeek: 7}), 'long')).toBe('Sunday');
  });

  it('labels days of the month', () => {
    const monthly = item({isoDayOfWeek: null, dayOfMonth: 5});
    expect(dayLabel(monthly, 'short')).toBe('Day 5');
    expect(dayLabel(monthly, 'long')).toBe('Day 5');
  });
});

describe('sortScheduleItems', () => {
  it('sorts by day then sequence number without mutating the input', () => {
    const input = [
      item({menuItemId: 'c', isoDayOfWeek: 2, sequenceNumber: 1}),
      item({menuItemId: 'b', isoDayOfWeek: 1, sequenceNumber: 2}),
      item({menuItemId: 'a', isoDayOfWeek: 1, sequenceNumber: 1}),
    ];
    expect(sortScheduleItems(input).map(i => i.menuItemId)).toEqual(['a', 'b', 'c']);
    expect(input[0].menuItemId).toBe('c');
  });

  it('sorts monthly items by day of month', () => {
    const input = [
      item({menuItemId: 'b', isoDayOfWeek: null, dayOfMonth: 10}),
      item({menuItemId: 'a', isoDayOfWeek: null, dayOfMonth: 2}),
    ];
    expect(sortScheduleItems(input).map(i => i.menuItemId)).toEqual(['a', 'b']);
  });
});

describe('summarizeSchedule', () => {
  it('summarizes an empty schedule', () => {
    expect(summarizeSchedule([])).toEqual({
      mealCount: 0,
      slotLabels: [],
      daysLabel: null,
      timeLabel: null,
      foodType: null,
      coverMenuItemId: null,
    });
  });

  it('summarizes Mon-Fri lunches as a range', () => {
    const items = weekdays([1, 2, 3, 4, 5]);
    items[2] = {...items[2], menuItemFoodType: 'NON_VEG'};
    const summary = summarizeSchedule(items);
    expect(summary).toEqual({
      mealCount: 5,
      slotLabels: ['Lunch'],
      daysLabel: 'Mon – Fri',
      timeLabel: '12:30 PM',
      foodType: 'NON_VEG',
      coverMenuItemId: 'm1',
    });
    expect(formatMealCount(summary, 'week')).toBe('5 lunches');
  });

  it('lists non-consecutive days with commas', () => {
    expect(summarizeSchedule(weekdays([1, 3, 5])).daysLabel).toBe('Mon, Wed, Fri');
  });

  it('says Every day for all seven days', () => {
    expect(summarizeSchedule(weekdays([1, 2, 3, 4, 5, 6, 7])).daysLabel).toBe('Every day');
  });

  it('counts distinct day and slot pairs, not rows', () => {
    const items = [
      item({menuItemId: 'a', isoDayOfWeek: 1, mealSlotCode: 'LUNCH', sequenceNumber: 1}),
      item({menuItemId: 'b', isoDayOfWeek: 1, mealSlotCode: 'LUNCH', sequenceNumber: 2}),
      item({
        menuItemId: 'c',
        isoDayOfWeek: 1,
        mealSlotCode: 'DINNER',
        serviceTime: '20:00:00',
        sequenceNumber: 3,
      }),
    ];
    const summary = summarizeSchedule(items);
    expect(summary.mealCount).toBe(2);
    expect(summary.slotLabels).toEqual(['Lunch', 'Dinner']);
    expect(summary.timeLabel).toBeNull();
    expect(formatMealCount(summary, 'week')).toBe('2 meals');
  });

  it('summarizes monthly schedules by day count', () => {
    const items = [3, 10, 17].map(d =>
      item({menuItemId: `m${d}`, isoDayOfWeek: null, dayOfMonth: d}),
    );
    const summary = summarizeSchedule(items);
    expect(summary.daysLabel).toBe('3 days a month');
    expect(summary.mealCount).toBe(3);
  });

  it('prefers non-veg, then egg, then veg for the food type', () => {
    const veg = item({menuItemFoodType: 'VEG'});
    const egg = item({isoDayOfWeek: 2, menuItemFoodType: 'EGG'});
    expect(summarizeSchedule([veg, egg]).foodType).toBe('EGG');
    expect(summarizeSchedule([veg]).foodType).toBe('VEG');
    expect(summarizeSchedule([item({menuItemFoodType: null})]).foodType).toBeNull();
  });

  it('takes the cover item from the first sorted item', () => {
    const items = [
      item({menuItemId: 'late', isoDayOfWeek: 3}),
      item({menuItemId: 'early', isoDayOfWeek: 1}),
    ];
    expect(summarizeSchedule(items).coverMenuItemId).toBe('early');
  });

  it('treats 12:30 and 12:30:00 as the same time', () => {
    const items = [
      item({serviceTime: '12:30'}),
      item({isoDayOfWeek: 2, serviceTime: '12:30:00'}),
    ];
    expect(summarizeSchedule(items).timeLabel).toBe('12:30 PM');
  });
});

describe('formatMealCount', () => {
  const base = {
    slotLabels: ['Lunch'],
    daysLabel: null,
    timeLabel: null,
    foodType: null,
    coverMenuItemId: null,
  };

  it('uses the slot name for one slot and handles the singular', () => {
    expect(formatMealCount({...base, mealCount: 1}, 'week')).toBe('1 lunch');
    expect(formatMealCount({...base, mealCount: 5}, 'month')).toBe('5 lunches');
    expect(
      formatMealCount({...base, mealCount: 4, slotLabels: ['Dinner']}, 'week'),
    ).toBe('4 dinners');
  });

  it('falls back to meals for several slots or none', () => {
    const two = {...base, slotLabels: ['Lunch', 'Dinner']};
    expect(formatMealCount({...two, mealCount: 7}, 'week')).toBe('7 meals');
    expect(formatMealCount({...two, mealCount: 1}, 'week')).toBe('1 meal');
    expect(formatMealCount({...base, mealCount: 0, slotLabels: []}, 'week')).toBe(
      '0 meals',
    );
  });
});
