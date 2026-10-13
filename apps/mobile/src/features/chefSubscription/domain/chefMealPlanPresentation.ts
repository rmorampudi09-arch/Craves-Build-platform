// Pure presentation helpers for the chef meal-plan list.
import type {StatusChipTone} from '../../chefShell/components/ui/StatusChip';
import {formatPlanPrice} from '../../customerSubscription/domain/mealPlanPresentation';
import {
  billingUnit,
  summarizeSchedule,
  type ScheduleItemLike,
} from '../../mealPlans/domain/mealPlanSchedule';
import type {ChefMealPlan} from '../api/chefSubscriptionApi';

const STATUS: Record<ChefMealPlan['status'], {label: string; tone: StatusChipTone}> = {
  DRAFT: {label: 'Draft', tone: 'draft'},
  PENDING_APPROVAL: {label: 'Waiting approval', tone: 'cooking'},
  ACTIVE: {label: 'Live', tone: 'ready'},
  REJECTED: {label: 'Changes requested', tone: 'new'},
  INACTIVE: {label: 'Inactive', tone: 'done'},
};

export function chefPlanStatusPresentation(status: ChefMealPlan['status']): {
  label: string;
  tone: StatusChipTone;
} {
  return STATUS[status];
}

export type ChefPlanFilter = 'ALL' | 'LIVE' | 'WAITING' | 'DRAFTS';

/** Inactive plans show only under All; a plan Craves sent back for changes is still the chef's draft to fix. */
export function filterChefPlans<T extends Pick<ChefMealPlan, 'status'>>(
  plans: readonly T[],
  filter: ChefPlanFilter,
): T[] {
  const statuses: Record<Exclude<ChefPlanFilter, 'ALL'>, ChefMealPlan['status'][]> = {
    LIVE: ['ACTIVE'],
    WAITING: ['PENDING_APPROVAL'],
    DRAFTS: ['DRAFT', 'REJECTED'],
  };
  return filter === 'ALL' ? [...plans] : plans.filter(plan => statuses[filter].includes(plan.status));
}

export function chefPlanMetrics(plans: readonly Pick<ChefMealPlan, 'status'>[]) {
  const count = (...statuses: ChefMealPlan['status'][]) =>
    plans.filter(plan => statuses.includes(plan.status)).length;
  return {
    total: plans.length,
    live: count('ACTIVE'),
    pending: count('PENDING_APPROVAL'),
    draft: count('DRAFT', 'REJECTED'),
  };
}

/** "Weekly · Lunch · Mon – Fri"; just the frequency while the schedule is empty or not loaded. */
export function chefPlanMetaLine(
  plan: Pick<ChefMealPlan, 'billingPeriod'>,
  items: readonly ScheduleItemLike[] | undefined,
): string {
  const parts = [billingUnit(plan.billingPeriod) === 'month' ? 'Monthly' : 'Weekly'];
  if (items && items.length > 0) {
    const summary = summarizeSchedule(items);
    parts.push(summary.slotLabels.join(', '));
    if (summary.daysLabel) {
      parts.push(summary.daysLabel === 'Every day' ? 'every day' : summary.daysLabel);
    }
  }
  return parts.join(' · ');
}

/** "8 subscribers"; null until the backend sends the count. */
export function subscriberCountLabel(plan: Pick<ChefMealPlan, 'activeSubscriberCount'>): string | null {
  const count = plan.activeSubscriberCount;
  return typeof count === 'number' ? `${count} ${count === 1 ? 'subscriber' : 'subscribers'}` : null;
}

export function chefPlanPriceLabel(
  plan: Pick<ChefMealPlan, 'amount' | 'currency' | 'billingPeriod'>,
): string {
  return `${formatPlanPrice(plan.amount, plan.currency)} / ${billingUnit(plan.billingPeriod)}`;
}

/** Spoken summary for the card button, e.g. "Weekly Home Lunch Plan, Live, ₹1,499 per week". */
export function chefPlanAccessibilityLabel(
  plan: Pick<ChefMealPlan, 'name' | 'status' | 'amount' | 'currency' | 'billingPeriod'>,
): string {
  return [
    plan.name,
    STATUS[plan.status].label,
    chefPlanPriceLabel(plan).replace(' / ', ' per '),
  ].join(', ');
}

/** The switch position, or null when the switch must be hidden (not live, or an older backend without the field). */
export function acceptingSubscribersValue(
  plan: Pick<ChefMealPlan, 'status' | 'acceptingSubscribers'>,
): boolean | null {
  return plan.status === 'ACTIVE' && typeof plan.acceptingSubscribers === 'boolean'
    ? plan.acceptingSubscribers
    : null;
}

export function acceptingSubscribersLabel(accepting: boolean): string {
  return accepting ? 'Taking new subscribers' : 'Not taking new subscribers';
}
