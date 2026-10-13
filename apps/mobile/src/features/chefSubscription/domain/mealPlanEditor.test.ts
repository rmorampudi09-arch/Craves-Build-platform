import type {ChefMealSchedule} from '../api/chefSubscriptionApi';
import {
  addMealLabel,
  addSlot,
  copyDayToWeekdays,
  dayRangeLabel,
  daysWithMeals,
  freeSlotsForDay,
  groupMealDays,
  otherWeekdaysHaveMeals,
  removeSlot,
  scheduleToSlots,
  setSlotDish,
  setSlotQuantity,
  setSlotTime,
  slotsToScheduleRequest,
  stepWithErrors,
  TIME_OPTIONS,
  validateMealPlanForm,
  type EditorSlot,
} from './mealPlanEditor';

const DISH_A = '44444444-4444-4444-8444-444444444444';
const DISH_B = '55555555-5555-4555-8555-555555555555';

const slot = (fields: Partial<EditorSlot> & Pick<EditorSlot, 'day' | 'slot'>): EditorSlot => ({
  key: `${fields.day}-${fields.slot}`,
  time: '12:30',
  menuItemId: DISH_A,
  quantity: 1,
  ...fields,
});

const validForm = {name: 'Home Lunch', description: 'Fresh lunches.', amount: '1499'};

describe('slotsToScheduleRequest', () => {
  it('numbers meals per day in breakfast, lunch, snack, dinner order', () => {
    const request = slotsToScheduleRequest(
      [
        slot({day: 1, slot: 'DINNER', time: '19:30', menuItemId: DISH_B}),
        slot({day: 2, slot: 'LUNCH'}),
        slot({day: 1, slot: 'LUNCH', quantity: 2}),
      ],
      'WEEKLY',
      24,
    );

    expect(request).toEqual({
      recurrenceType: 'WEEKLY',
      timezone: 'Asia/Kolkata',
      generationLeadHours: 24,
      items: [
        {menuItemId: DISH_A, quantity: 2, isoDayOfWeek: 1, dayOfMonth: null, mealSlotCode: 'LUNCH', serviceTime: '12:30', sequenceNumber: 1},
        {menuItemId: DISH_B, quantity: 1, isoDayOfWeek: 1, dayOfMonth: null, mealSlotCode: 'DINNER', serviceTime: '19:30', sequenceNumber: 2},
        {menuItemId: DISH_A, quantity: 1, isoDayOfWeek: 2, dayOfMonth: null, mealSlotCode: 'LUNCH', serviceTime: '12:30', sequenceNumber: 1},
      ],
    });
  });

  it('uses dayOfMonth for monthly plans', () => {
    const request = slotsToScheduleRequest([slot({day: 5, slot: 'LUNCH'})], 'MONTHLY', 48);

    expect(request.recurrenceType).toBe('MONTHLY');
    expect(request.generationLeadHours).toBe(48);
    expect(request.items[0]).toMatchObject({isoDayOfWeek: null, dayOfMonth: 5, sequenceNumber: 1});
  });

  it('leaves out meals that have no dish yet', () => {
    const request = slotsToScheduleRequest(
      [slot({day: 1, slot: 'LUNCH', menuItemId: null}), slot({day: 1, slot: 'DINNER'})],
      'WEEKLY',
      24,
    );

    expect(request.items).toEqual([expect.objectContaining({mealSlotCode: 'DINNER', sequenceNumber: 1})]);
  });
});

describe('scheduleToSlots', () => {
  it('round-trips a saved schedule', () => {
    const items = [
      {id: '1', menuItemId: DISH_A, quantity: 1, isoDayOfWeek: 1, dayOfMonth: null, mealSlotCode: 'LUNCH', serviceTime: '12:30:00', sequenceNumber: 1},
      {id: '2', menuItemId: DISH_B, quantity: 3, isoDayOfWeek: 1, dayOfMonth: null, mealSlotCode: 'DINNER', serviceTime: '19:30:00', sequenceNumber: 2},
      {id: '3', menuItemId: DISH_A, quantity: 1, isoDayOfWeek: 3, dayOfMonth: null, mealSlotCode: 'BREAKFAST', serviceTime: '08:00:00', sequenceNumber: 1},
    ];
    const schedule = {recurrenceType: 'WEEKLY', generationLeadHours: 12, items} as unknown as ChefMealSchedule;

    const slots = scheduleToSlots(schedule);
    expect(slots.map(s => [s.day, s.slot, s.time])).toEqual([
      [1, 'LUNCH', '12:30'],
      [1, 'DINNER', '19:30'],
      [3, 'BREAKFAST', '08:00'],
    ]);
    expect(slotsToScheduleRequest(slots, 'WEEKLY', 12).items).toEqual(
      items.map(({id: _id, ...item}) => ({...item, serviceTime: item.serviceTime.slice(0, 5)})),
    );
  });

  it('reads monthly days from dayOfMonth', () => {
    const schedule = {
      recurrenceType: 'MONTHLY',
      items: [{id: '1', menuItemId: DISH_A, quantity: 1, isoDayOfWeek: null, dayOfMonth: 28, mealSlotCode: 'SNACK', serviceTime: '16:30:00', sequenceNumber: 1}],
    } as unknown as ChefMealSchedule;

    expect(scheduleToSlots(schedule)).toEqual([
      {key: '1', day: 28, slot: 'SNACK', time: '16:30', menuItemId: DISH_A, quantity: 1},
    ]);
  });
});

describe('slot edits', () => {
  it('setSlotTime updates every slot with that code across days', () => {
    const slots = [slot({day: 1, slot: 'LUNCH'}), slot({day: 4, slot: 'LUNCH'}), slot({day: 1, slot: 'DINNER', time: '19:30'})];

    expect(setSlotTime(slots, 'LUNCH', '13:00').map(s => s.time)).toEqual(['13:00', '13:00', '19:30']);
  });

  it('setSlotQuantity clamps to 1-100', () => {
    const slots = [slot({day: 1, slot: 'LUNCH'})];

    expect(setSlotQuantity(slots, '1-LUNCH', 0)[0].quantity).toBe(1);
    expect(setSlotQuantity(slots, '1-LUNCH', 101)[0].quantity).toBe(100);
    expect(setSlotQuantity(slots, '1-LUNCH', 7)[0].quantity).toBe(7);
  });

  it('addSlot reuses the time already set for that slot code, else the default', () => {
    const slots = addSlot([slot({day: 1, slot: 'LUNCH', time: '13:30'})], 2, 'LUNCH');
    expect(slots[1]).toEqual({key: '2-LUNCH', day: 2, slot: 'LUNCH', time: '13:30', menuItemId: null, quantity: 1});

    expect(addSlot([], 1, 'DINNER')[0].time).toBe('19:30');
  });

  it('addSlot keeps day and slot order and ignores a slot the day already has', () => {
    const slots = addSlot(addSlot([slot({day: 1, slot: 'DINNER'})], 1, 'BREAKFAST'), 1, 'DINNER');

    expect(slots.map(s => s.slot)).toEqual(['BREAKFAST', 'DINNER']);
  });

  it('removeSlot, setSlotDish, daysWithMeals and freeSlotsForDay', () => {
    const slots = [slot({day: 1, slot: 'LUNCH'}), slot({day: 3, slot: 'DINNER'})];

    expect(removeSlot(slots, '1-LUNCH').map(s => s.key)).toEqual(['3-DINNER']);
    expect(setSlotDish(slots, '3-DINNER', DISH_B)[1].menuItemId).toBe(DISH_B);
    expect([...daysWithMeals(slots)]).toEqual([1, 3]);
    expect(freeSlotsForDay(slots, 1)).toEqual(['BREAKFAST', 'SNACK', 'DINNER']);
  });
});

describe('validateMealPlanForm', () => {
  it('passes a draft without meals', () => {
    expect(validateMealPlanForm(validForm, [], 'draft')).toEqual({});
  });

  it('requires name, description and a positive price', () => {
    const errors = validateMealPlanForm({name: ' ', description: '', amount: '0'}, [], 'draft');

    expect(Object.keys(errors).sort()).toEqual(['amount', 'description', 'name']);
    expect(validateMealPlanForm({...validForm, name: 'x'.repeat(161)}, [], 'draft').name).toBeTruthy();
    expect(validateMealPlanForm({...validForm, description: 'x'.repeat(501)}, [], 'draft').description).toBeTruthy();
    expect(validateMealPlanForm({...validForm, amount: 'abc'}, [], 'draft').amount).toBeTruthy();
  });

  it('needs at least one meal to submit', () => {
    expect(validateMealPlanForm(validForm, [], 'submit').schedule).toBeTruthy();
  });

  it('flags a meal without a dish on submit only', () => {
    const slots = [slot({day: 1, slot: 'LUNCH', menuItemId: null}), slot({day: 1, slot: 'DINNER'})];

    expect(validateMealPlanForm(validForm, slots, 'submit')).toEqual({'slot:1-LUNCH': 'Select a dish.'});
    expect(validateMealPlanForm(validForm, slots, 'draft')).toEqual({});
  });
});

it('offers service times every 30 minutes from 06:00 to 23:30', () => {
  expect(TIME_OPTIONS[0]).toBe('06:00');
  expect(TIME_OPTIONS[1]).toBe('06:30');
  expect(TIME_OPTIONS[TIME_OPTIONS.length - 1]).toBe('23:30');
  expect(TIME_OPTIONS).toHaveLength(36);
});

describe('copyDayToWeekdays', () => {
  const tuesday = [slot({day: 2, slot: 'LUNCH', quantity: 2}), slot({day: 2, slot: 'DINNER', time: '19:30', menuItemId: DISH_B})];

  it('gives Monday to Friday the same meals, dishes and quantities', () => {
    const copied = copyDayToWeekdays(tuesday, 2);

    expect([1, 2, 3, 4, 5].map(day => copied.filter(s => s.day === day).map(s => [s.slot, s.menuItemId, s.quantity]))).toEqual(
      Array.from({length: 5}, () => [
        ['LUNCH', DISH_A, 2],
        ['DINNER', DISH_B, 1],
      ]),
    );
    expect(new Set(copied.map(s => s.key)).size).toBe(copied.length);
  });

  it('replaces what the other weekdays had and leaves the weekend alone', () => {
    const copied = copyDayToWeekdays(
      [...tuesday, slot({day: 3, slot: 'SNACK', time: '16:30'}), slot({day: 6, slot: 'LUNCH', menuItemId: DISH_B})],
      2,
    );

    expect(copied.some(s => s.day === 3 && s.slot === 'SNACK')).toBe(false);
    expect(copied.filter(s => s.day === 6)).toEqual([slot({day: 6, slot: 'LUNCH', menuItemId: DISH_B})]);
  });

  it('knows when the other weekdays already have meals', () => {
    expect(otherWeekdaysHaveMeals(tuesday, 2)).toBe(false);
    expect(otherWeekdaysHaveMeals([...tuesday, slot({day: 4, slot: 'LUNCH'})], 2)).toBe(true);
    expect(otherWeekdaysHaveMeals([...tuesday, slot({day: 7, slot: 'LUNCH'})], 2)).toBe(false);
  });
});

describe('groupMealDays', () => {
  it('puts days with the same meals together, in day order', () => {
    const groups = groupMealDays([
      slot({day: 1, slot: 'LUNCH'}),
      slot({day: 2, slot: 'LUNCH'}),
      slot({day: 3, slot: 'LUNCH', menuItemId: DISH_B}),
      slot({day: 4, slot: 'LUNCH'}),
    ]);

    expect(groups.map(group => group.days)).toEqual([[1, 2, 4], [3]]);
    expect(groups[0].meals.map(meal => meal.slot)).toEqual(['LUNCH']);
  });

  it('treats a different quantity or time as a different day', () => {
    expect(
      groupMealDays([slot({day: 1, slot: 'LUNCH'}), slot({day: 2, slot: 'LUNCH', quantity: 2}), slot({day: 3, slot: 'LUNCH', time: '13:00'})]),
    ).toHaveLength(3);
  });
});

describe('dayRangeLabel', () => {
  it('writes runs of days the way the board does', () => {
    expect(dayRangeLabel('WEEKLY', [3, 4, 5])).toBe('Wed – Fri');
    expect(dayRangeLabel('WEEKLY', [1, 3, 4, 5, 7])).toBe('Mon, Wed – Fri, Sun');
    expect(dayRangeLabel('WEEKLY', [2])).toBe('Tue');
    expect(dayRangeLabel('MONTHLY', [1, 2, 3, 15])).toBe('Day 1 – 3, 15');
  });
});

describe('addMealLabel', () => {
  it('lists the meals still free on a day', () => {
    expect(addMealLabel(['BREAKFAST', 'SNACK', 'DINNER'])).toBe('Add breakfast, snack or dinner');
    expect(addMealLabel(['SNACK', 'DINNER'])).toBe('Add snack or dinner');
    expect(addMealLabel(['DINNER'])).toBe('Add dinner');
    expect(addMealLabel(['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'])).toBe('Add a meal');
  });
});

describe('stepWithErrors', () => {
  it('sends the chef to the first step with a problem', () => {
    expect(stepWithErrors({name: 'Enter a plan name.', schedule: 'x'})).toBe(1);
    expect(stepWithErrors({amount: 'x'})).toBe(1);
    expect(stepWithErrors({'slot:1-LUNCH': 'Select a dish.'})).toBe(2);
    expect(stepWithErrors({schedule: 'x'})).toBe(2);
    expect(stepWithErrors({})).toBeNull();
  });
});
