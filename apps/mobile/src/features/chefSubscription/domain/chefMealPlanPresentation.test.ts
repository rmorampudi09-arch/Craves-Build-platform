import type {ChefMealPlan} from '../api/chefSubscriptionApi';
import {
  acceptingSubscribersLabel,
  acceptingSubscribersValue,
  chefPlanAccessibilityLabel,
  chefPlanMetaLine,
  chefPlanMetrics,
  chefPlanPriceLabel,
  chefPlanStatusPresentation,
  filterChefPlans,
  subscriberCountLabel,
} from './chefMealPlanPresentation';

const plan = (fields: Partial<ChefMealPlan>) => fields as ChefMealPlan;

const item = (isoDayOfWeek: number, mealSlotCode = 'LUNCH') => ({
  menuItemId: `dish-${isoDayOfWeek}`,
  isoDayOfWeek,
  dayOfMonth: null,
  mealSlotCode,
  serviceTime: '12:30:00',
  sequenceNumber: 1,
  quantity: 1,
});

describe('chefPlanStatusPresentation', () => {
  it.each([
    ['DRAFT', 'Draft', 'draft'],
    ['PENDING_APPROVAL', 'Waiting approval', 'cooking'],
    ['ACTIVE', 'Live', 'ready'],
    ['REJECTED', 'Changes requested', 'new'],
    ['INACTIVE', 'Inactive', 'done'],
  ] as const)('%s reads "%s" with the %s chip', (status, label, tone) => {
    expect(chefPlanStatusPresentation(status)).toEqual({label, tone});
  });
});

describe('filterChefPlans', () => {
  const plans = (['ACTIVE', 'PENDING_APPROVAL', 'DRAFT', 'REJECTED', 'INACTIVE'] as const).map(status =>
    plan({status}),
  );
  const statuses = (filter: Parameters<typeof filterChefPlans>[1]) =>
    filterChefPlans(plans, filter).map(chosen => chosen.status);

  it('keeps every plan under All, including inactive ones', () => {
    expect(statuses('ALL')).toHaveLength(5);
  });

  it('splits Live, Waiting approval and Drafts (changes requested counts as a draft)', () => {
    expect(statuses('LIVE')).toEqual(['ACTIVE']);
    expect(statuses('WAITING')).toEqual(['PENDING_APPROVAL']);
    expect(statuses('DRAFTS')).toEqual(['DRAFT', 'REJECTED']);
  });
});

describe('chefPlanMetrics', () => {
  it('counts live, pending and draft, with rejected plans counted as draft', () => {
    const statuses = [
      'ACTIVE',
      'ACTIVE',
      'PENDING_APPROVAL',
      'DRAFT',
      'REJECTED',
      'INACTIVE',
    ] as const;
    expect(chefPlanMetrics(statuses.map(status => plan({status})))).toEqual({
      total: 6,
      live: 2,
      pending: 1,
      draft: 2,
    });
  });

  it('is all zeros without plans', () => {
    expect(chefPlanMetrics([])).toEqual({total: 0, live: 0, pending: 0, draft: 0});
  });
});

describe('chefPlanMetaLine', () => {
  it('reads frequency, meal and days from the schedule', () => {
    const items = [1, 2, 3, 4, 5].map(day => item(day));
    expect(chefPlanMetaLine(plan({billingPeriod: 'WEEKLY'}), items)).toBe('Weekly · Lunch · Mon – Fri');
  });

  it('says every day, and lists each meal a plan serves', () => {
    const items = [1, 2, 3, 4, 5, 6, 7].flatMap(day => [item(day, 'BREAKFAST'), item(day, 'DINNER')]);
    expect(chefPlanMetaLine(plan({billingPeriod: 'WEEKLY'}), items)).toBe('Weekly · Breakfast, Dinner · every day');
  });

  it('shows only the frequency while the schedule is empty or not loaded', () => {
    expect(chefPlanMetaLine(plan({billingPeriod: 'MONTHLY'}), [])).toBe('Monthly');
    expect(chefPlanMetaLine(plan({billingPeriod: 'WEEKLY'}), undefined)).toBe('Weekly');
    expect(chefPlanMetaLine(plan({billingPeriod: 'FORTNIGHTLY'}), undefined)).toBe('14 days');
  });

  it('counts monthly day-of-month meals', () => {
    const items = [5, 12].map(dayOfMonth => ({
      ...item(1, 'DINNER'),
      isoDayOfWeek: null,
      dayOfMonth,
    }));
    expect(chefPlanMetaLine(plan({billingPeriod: 'MONTHLY'}), items)).toBe('Monthly · Dinner · 2 days a month');
  });
});

describe('subscriberCountLabel', () => {
  it('is absent until the backend sends the count', () => {
    expect(subscriberCountLabel(plan({}))).toBeNull();
    expect(subscriberCountLabel(plan({activeSubscriberCount: null}))).toBeNull();
  });

  it('reads the count in words, including zero', () => {
    expect(subscriberCountLabel(plan({activeSubscriberCount: 8}))).toBe('8 subscribers');
    expect(subscriberCountLabel(plan({activeSubscriberCount: 1}))).toBe('1 subscriber');
    expect(subscriberCountLabel(plan({activeSubscriberCount: 0}))).toBe('0 subscribers');
  });
});

describe('chefPlanPriceLabel', () => {
  it('formats the price per billing unit', () => {
    expect(
      chefPlanPriceLabel(plan({amount: '1499', currency: 'INR', billingPeriod: 'WEEKLY'})),
    ).toBe('₹1,499 / week');
    expect(
      chefPlanPriceLabel(plan({amount: '5499.50', currency: 'INR', billingPeriod: 'MONTHLY'})),
    ).toBe('₹5,499.50 / 28 days');
    expect(
      chefPlanPriceLabel(plan({amount: '1499', currency: 'INR', billingPeriod: 'FORTNIGHTLY'})),
    ).toBe('₹1,499 / 14 days');
  });
});

describe('chefPlanAccessibilityLabel', () => {
  it('reads name, status and price per billing unit', () => {
    expect(
      chefPlanAccessibilityLabel(
        plan({
          name: 'Weekly Home Lunch Plan',
          status: 'ACTIVE',
          amount: '1499',
          currency: 'INR',
          billingPeriod: 'WEEKLY',
        }),
      ),
    ).toBe('Weekly Home Lunch Plan, Live, ₹1,499 per week');
  });
});

describe('accepting-subscribers switch', () => {
  it('shows only for a live plan that reports the field', () => {
    expect(acceptingSubscribersValue(plan({status: 'ACTIVE', acceptingSubscribers: true}))).toBe(true);
    expect(acceptingSubscribersValue(plan({status: 'ACTIVE', acceptingSubscribers: false}))).toBe(false);
    expect(acceptingSubscribersValue(plan({status: 'ACTIVE'}))).toBeNull();
    expect(acceptingSubscribersValue(plan({status: 'ACTIVE', acceptingSubscribers: null}))).toBeNull();
    expect(acceptingSubscribersValue(plan({status: 'DRAFT', acceptingSubscribers: true}))).toBeNull();
    expect(
      acceptingSubscribersValue(plan({status: 'PENDING_APPROVAL', acceptingSubscribers: false})),
    ).toBeNull();
  });

  it('names each position in plain words', () => {
    expect(acceptingSubscribersLabel(true)).toBe('Taking new subscribers');
    expect(acceptingSubscribersLabel(false)).toBe('Not taking new subscribers');
  });
});
