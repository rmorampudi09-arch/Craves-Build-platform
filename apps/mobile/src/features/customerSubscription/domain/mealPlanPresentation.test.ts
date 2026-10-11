import type {
  CustomerSubscriptionOccurrence,
  PublicSubscriptionPolicy,
} from '../api/customerSubscriptionApi';
import type {CustomerAddress} from '../../customerAddresses/domain/customerAddressContract';
import {
  addressAreaLine,
  firstScheduledItem,
  formatCutoff,
  formatMealPlanDate,
  formatPlanPrice,
  nextOccurrence,
  occurrenceDishNames,
  occurrenceStatusPresentation,
  planRules,
  shortSubscriptionId,
  subscriptionStatusPresentation,
  upcomingStartDates,
  weekOccurrences,
} from './mealPlanPresentation';

describe('formatPlanPrice', () => {
  it('formats rupees with grouping and no trailing zeros', () => {
    expect(formatPlanPrice('1499', 'INR')).toBe('₹1,499');
    expect(formatPlanPrice(12500, 'INR')).toBe('₹12,500');
    expect(formatPlanPrice('99.00', 'INR')).toBe('₹99');
    expect(formatPlanPrice(0, 'INR')).toBe('₹0');
  });

  it('keeps paise when non-zero', () => {
    expect(formatPlanPrice('1499.50', 'INR')).toBe('₹1,499.50');
    expect(formatPlanPrice(1499.5, 'INR')).toBe('₹1,499.50');
  });

  it('prefixes other currencies with their code', () => {
    expect(formatPlanPrice(10, 'USD')).toBe('USD 10');
  });

  it('returns unparseable amounts as-is', () => {
    expect(formatPlanPrice('abc', 'INR')).toBe('₹abc');
  });
});

describe('formatMealPlanDate', () => {
  it('formats date-only strings without timezone shift', () => {
    // 2026-09-29 is a Tuesday; 2025-09-29 is a Monday.
    expect(formatMealPlanDate('2026-09-29', 'long')).toBe('Tue, 29 Sep 2026');
    expect(formatMealPlanDate('2026-09-29', 'short')).toBe('Tue, 29 Sep');
    expect(formatMealPlanDate('2025-09-29', 'long')).toBe('Mon, 29 Sep 2025');
    expect(formatMealPlanDate('2026-01-01', 'short')).toBe('Thu, 1 Jan');
  });

  it('returns invalid input unchanged', () => {
    expect(formatMealPlanDate('not-a-date', 'long')).toBe('not-a-date');
  });
});

describe('upcomingStartDates', () => {
  it('starts tomorrow and defaults to seven days', () => {
    const dates = upcomingStartDates(new Date(2026, 9, 11, 22, 30));
    expect(dates).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
  });

  it('rolls over month and year ends and honours count', () => {
    expect(upcomingStartDates(new Date(2026, 11, 30), 3)).toEqual([
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});

describe('subscriptionStatusPresentation', () => {
  it.each([
    ['ACTIVE', 'Active', 'success'],
    ['PAUSED', 'Paused', 'warning'],
    ['PENDING_PAYMENT', 'Payment pending', 'warning'],
    ['PAYMENT_FAILED', 'Payment failed', 'error'],
    ['CANCELLED', 'Cancelled', 'neutral'],
    ['EXPIRED', 'Ended', 'neutral'],
    ['SOME_NEW_STATE', 'Some New State', 'neutral'],
  ])('%s -> %s (%s)', (status, label, tone) => {
    expect(subscriptionStatusPresentation(status)).toEqual({label, tone});
  });
});

describe('occurrenceStatusPresentation', () => {
  it.each([
    ['BILLING_PENDING', 'Awaiting payment', 'warning', 0],
    ['PAYMENT_PENDING', 'Awaiting payment', 'warning', 0],
    ['READY_FOR_ORDER', 'Scheduled', 'info', 1],
    ['ORDER_REQUESTED', 'Order requested', 'info', 1],
    ['ORDER_CREATED', 'Order placed', 'success', 2],
    ['SKIPPED', 'Skipped', 'neutral', null],
    ['CANCELLED', 'Cancelled', 'neutral', null],
    ['FAILED', "Couldn't place order", 'error', null],
    ['SOMETHING_ELSE', 'Something Else', 'neutral', null],
  ])('%s -> %s', (status, label, tone, step) => {
    expect(occurrenceStatusPresentation(status)).toEqual({label, tone, step});
  });
});

describe('formatCutoff', () => {
  it('uses hours for whole hours and minutes otherwise', () => {
    expect(formatCutoff(1440)).toBe('24 hours');
    expect(formatCutoff(90)).toBe('90 minutes');
    expect(formatCutoff(60)).toBe('1 hour');
    expect(formatCutoff(120)).toBe('2 hours');
    expect(formatCutoff(1)).toBe('1 minute');
    expect(formatCutoff(45)).toBe('45 minutes');
  });
});

function policy(
  over: Partial<PublicSubscriptionPolicy> = {},
): PublicSubscriptionPolicy {
  return {
    customerPauseEnabled: false,
    customerResumeEnabled: false,
    customerCancelEnabled: false,
    customerSkipEnabled: false,
    pauseCutoffMinutes: 0,
    resumeLeadMinutes: 1440,
    cancelCutoffMinutes: 0,
    skipCutoffMinutes: 1440,
    holidayPolicyReference: null,
    unusedMealPolicyReference: null,
    refundPolicyReference: null,
    ...over,
  };
}

describe('planRules', () => {
  it('returns the support rule when nothing is enabled', () => {
    expect(planRules(policy())).toEqual([
      {
        icon: 'info',
        title: 'Plan changes',
        body: 'Contact Craves support to change this plan.',
      },
    ]);
  });

  it('returns one rule per enabled flag with cutoffs', () => {
    const rules = planRules(
      policy({
        customerPauseEnabled: true,
        customerSkipEnabled: true,
        customerCancelEnabled: true,
        pauseCutoffMinutes: 120,
        skipCutoffMinutes: 1440,
      }),
    );
    expect(rules).toEqual([
      {
        icon: 'pause',
        title: 'Pause or resume',
        body: 'Pause from My Meal Plan up to 2 hours before a meal.',
      },
      {
        icon: 'calendar',
        title: 'Skip a meal',
        body: 'Skip any upcoming meal up to 24 hours before it.',
      },
      {
        icon: 'close',
        title: 'Cancel anytime',
        body: 'Cancel anytime. Upcoming meals stop right away; meals already being prepared are still delivered.',
      },
    ]);
  });

  it('uses the anytime wording when the cutoff is 0 or null', () => {
    const zero = planRules(
      policy({
        customerPauseEnabled: true,
        customerSkipEnabled: true,
        skipCutoffMinutes: 0,
      }),
    );
    expect(zero[0].body).toBe('Pause from My Meal Plan anytime before a meal.');
    expect(zero[1].body).toBe('Skip any upcoming meal anytime before it.');
    const nulls = planRules(
      policy({customerPauseEnabled: true, pauseCutoffMinutes: null}),
    );
    expect(nulls[0].body).toBe('Pause from My Meal Plan anytime before a meal.');
  });

  it('only lists the enabled flags', () => {
    const rules = planRules(policy({customerCancelEnabled: true}));
    expect(rules.map(r => r.icon)).toEqual(['close']);
  });
});

function occ(
  id: string,
  serviceDate: string,
  status = 'READY_FOR_ORDER',
  time = '06:30:00Z',
  items: CustomerSubscriptionOccurrence['items'] = [],
): CustomerSubscriptionOccurrence {
  return {
    id,
    serviceDate,
    mealSlotCode: 'LUNCH',
    serviceAt: `${serviceDate}T${time}`,
    status,
    items,
  };
}

describe('weekOccurrences', () => {
  // Wednesday 2026-10-14; the week is Mon 12 Oct - Sun 18 Oct.
  const today = new Date(2026, 9, 14, 9, 0);

  it('keeps only this Mon-Sun week, sorted by date then time', () => {
    const result = weekOccurrences(
      [
        occ('next-mon', '2026-10-19'),
        occ('sun', '2026-10-18'),
        occ('wed-dinner', '2026-10-14', 'READY_FOR_ORDER', '14:30:00Z'),
        occ('wed-lunch', '2026-10-14', 'READY_FOR_ORDER', '06:30:00Z'),
        occ('mon', '2026-10-12'),
        occ('prev-sun', '2026-10-11'),
      ],
      today,
    );
    expect(result.map(o => o.id)).toEqual([
      'mon',
      'wed-lunch',
      'wed-dinner',
      'sun',
    ]);
  });

  it('treats Sunday as the last day of the week', () => {
    const sunday = new Date(2026, 9, 11, 9, 0);
    const result = weekOccurrences(
      [
        occ('mon', '2026-10-05'),
        occ('sun', '2026-10-11'),
        occ('next', '2026-10-12'),
      ],
      sunday,
    );
    expect(result.map(o => o.id)).toEqual(['mon', 'sun']);
  });
});

describe('nextOccurrence', () => {
  const today = new Date(2026, 9, 14, 9, 0);

  it('skips past, skipped and cancelled occurrences', () => {
    const result = nextOccurrence(
      [
        occ('past', '2026-10-13'),
        occ('skipped', '2026-10-14', 'SKIPPED'),
        occ('cancelled', '2026-10-15', 'CANCELLED'),
        occ('good', '2026-10-16'),
        occ('later', '2026-10-17'),
      ],
      today,
    );
    expect(result?.id).toBe('good');
  });

  it('includes today and returns null when nothing qualifies', () => {
    expect(nextOccurrence([occ('today', '2026-10-14')], today)?.id).toBe('today');
    expect(nextOccurrence([occ('past', '2026-10-13')], today)).toBeNull();
    expect(nextOccurrence([], today)).toBeNull();
  });
});

describe('occurrenceDishNames', () => {
  const schedule = [
    {
      menuItemId: 'a',
      menuItemName: 'Dal Tadka',
      mealSlotCode: 'LUNCH',
      serviceTime: '12:30:00',
      sequenceNumber: 1,
      quantity: 1,
    },
    {
      menuItemId: 'b',
      menuItemName: 'Jeera Rice',
      mealSlotCode: 'LUNCH',
      serviceTime: '12:30:00',
      sequenceNumber: 2,
      quantity: 1,
    },
  ];

  it('maps items to dish names in order, using Meal for unknown items', () => {
    const o = occ('o', '2026-10-14', 'READY_FOR_ORDER', '06:30:00Z', [
      {menuItemId: 'b', quantity: 1, sequenceNumber: 1},
      {menuItemId: 'zzz', quantity: 1, sequenceNumber: 2},
      {menuItemId: 'a', quantity: 1, sequenceNumber: 3},
    ]);
    expect(occurrenceDishNames(o, schedule)).toEqual([
      'Jeera Rice',
      'Meal',
      'Dal Tadka',
    ]);
  });
});

describe('shortSubscriptionId', () => {
  it('builds a short upper-case reference', () => {
    expect(shortSubscriptionId('3f2a9c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b')).toBe(
      'CRV-3F2A9C1E',
    );
    expect(shortSubscriptionId('3f2a9c1e-…')).toBe('CRV-3F2A9C1E');
  });
});

describe('addressAreaLine', () => {
  const at = (areaName: string | null, districtName: string | null, city: string) =>
    addressAreaLine({areaName, districtName, city} as CustomerAddress);

  it('joins the locality and city, falling back to the district, without repeats', () => {
    expect(at('Madhapur', 'Serilingampally', 'Hyderabad')).toBe('Madhapur, Hyderabad');
    expect(at(null, 'Serilingampally', 'Hyderabad')).toBe('Serilingampally, Hyderabad');
    expect(at('Hyderabad', null, 'Hyderabad')).toBe('Hyderabad');
    expect(at(null, null, 'Hyderabad')).toBe('Hyderabad');
  });
});

describe('firstScheduledItem', () => {
  const item = (day: {isoDayOfWeek?: number; dayOfMonth?: number}, sequenceNumber: number) => ({
    menuItemId: `dish-${sequenceNumber}`,
    mealSlotCode: 'LUNCH',
    serviceTime: '12:30:00',
    quantity: 1,
    sequenceNumber,
    ...day,
  });

  it('picks the first weekly item on or after the start weekday, wrapping to next week', () => {
    const items = [item({isoDayOfWeek: 5}, 3), item({isoDayOfWeek: 1}, 1), item({isoDayOfWeek: 3}, 2)];
    // 2026-10-14 is a Wednesday, 2026-10-17 a Saturday.
    expect(firstScheduledItem(items, '2026-10-14')?.sequenceNumber).toBe(2);
    expect(firstScheduledItem(items, '2026-10-17')?.sequenceNumber).toBe(1);
  });

  it('uses the day of month for monthly plans and is null without items', () => {
    const items = [item({dayOfMonth: 20}, 2), item({dayOfMonth: 5}, 1)];
    expect(firstScheduledItem(items, '2026-10-12')?.sequenceNumber).toBe(2);
    expect(firstScheduledItem(items, '2026-10-30')?.sequenceNumber).toBe(1);
    expect(firstScheduledItem([], '2026-10-12')).toBeNull();
  });
});
