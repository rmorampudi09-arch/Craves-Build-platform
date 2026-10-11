import type {ChefMealPlan} from '../api/chefSubscriptionApi';
import {
  acceptingSubscribersHint,
  acceptingSubscribersValue,
  chefPlanMetaLine,
  chefPlanMetrics,
  chefPlanPriceLabel,
  chefPlanStatusPresentation,
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
    ['DRAFT', 'Draft', 'info'],
    ['PENDING_APPROVAL', 'Pending approval', 'warning'],
    ['ACTIVE', 'Live', 'success'],
    ['REJECTED', 'Changes requested', 'error'],
    ['INACTIVE', 'Inactive', 'neutral'],
  ] as const)('%s reads "%s" with the %s tone', (status, label, tone) => {
    expect(chefPlanStatusPresentation(status)).toEqual({label, tone});
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
  it('reads frequency, meal count and days from the schedule', () => {
    const items = [1, 2, 3, 4, 5].map(day => item(day));
    expect(chefPlanMetaLine(plan({billingPeriod: 'WEEKLY'}), items)).toBe(
      'Weekly · 5 lunches · Mon – Fri',
    );
  });

  it('shows only the frequency while the schedule is empty or not loaded', () => {
    expect(chefPlanMetaLine(plan({billingPeriod: 'MONTHLY'}), [])).toBe('Monthly');
    expect(chefPlanMetaLine(plan({billingPeriod: 'WEEKLY'}), undefined)).toBe('Weekly');
  });

  it('counts monthly day-of-month meals', () => {
    const items = [5, 12].map(dayOfMonth => ({
      ...item(1, 'DINNER'),
      isoDayOfWeek: null,
      dayOfMonth,
    }));
    expect(chefPlanMetaLine(plan({billingPeriod: 'MONTHLY'}), items)).toBe(
      'Monthly · 2 dinners · 2 days a month',
    );
  });
});

describe('chefPlanPriceLabel', () => {
  it('formats the price per billing unit', () => {
    expect(
      chefPlanPriceLabel(plan({amount: '1499', currency: 'INR', billingPeriod: 'WEEKLY'})),
    ).toBe('₹1,499 / week');
    expect(
      chefPlanPriceLabel(plan({amount: '5499.50', currency: 'INR', billingPeriod: 'MONTHLY'})),
    ).toBe('₹5,499.50 / month');
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

  it('explains what each position does', () => {
    expect(acceptingSubscribersHint(true)).toBe('Live and visible to customers.');
    expect(acceptingSubscribersHint(false)).toBe(
      'Hidden from new customers. Current subscribers are not affected.',
    );
  });
});
