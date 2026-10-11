// Pure presentation helpers for the chef meal-plan list.
import type {BadgeTone} from '../../../shared/components/Badge';
import {formatPlanPrice} from '../../customerSubscription/domain/mealPlanPresentation';
import {
  billingUnit,
  formatMealCount,
  summarizeSchedule,
  type ScheduleItemLike,
} from '../../mealPlans/domain/mealPlanSchedule';
import type {ChefMealPlan} from '../api/chefSubscriptionApi';

const STATUS: Record<ChefMealPlan['status'], {label: string; tone: BadgeTone}> = {
  DRAFT: {label: 'Draft', tone: 'info'},
  PENDING_APPROVAL: {label: 'Pending approval', tone: 'warning'},
  ACTIVE: {label: 'Live', tone: 'success'},
  REJECTED: {label: 'Changes requested', tone: 'error'},
  INACTIVE: {label: 'Inactive', tone: 'neutral'},
};

export function chefPlanStatusPresentation(status: ChefMealPlan['status']): {
  label: string;
  tone: BadgeTone;
} {
  return STATUS[status];
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

/** "Weekly · 5 lunches · Mon – Fri"; just the frequency while the schedule is empty or not loaded. */
export function chefPlanMetaLine(
  plan: Pick<ChefMealPlan, 'billingPeriod'>,
  items: readonly ScheduleItemLike[] | undefined,
): string {
  const unit = billingUnit(plan.billingPeriod);
  const parts = [unit === 'month' ? 'Monthly' : 'Weekly'];
  if (items && items.length > 0) {
    const summary = summarizeSchedule(items);
    parts.push(formatMealCount(summary, unit));
    if (summary.daysLabel) {
      parts.push(summary.daysLabel);
    }
  }
  return parts.join(' · ');
}

export function chefPlanPriceLabel(
  plan: Pick<ChefMealPlan, 'amount' | 'currency' | 'billingPeriod'>,
): string {
  return `${formatPlanPrice(plan.amount, plan.currency)} / ${billingUnit(plan.billingPeriod)}`;
}

/** The switch position, or null when the switch must be hidden (not live, or an older backend without the field). */
export function acceptingSubscribersValue(
  plan: Pick<ChefMealPlan, 'status' | 'acceptingSubscribers'>,
): boolean | null {
  return plan.status === 'ACTIVE' && typeof plan.acceptingSubscribers === 'boolean'
    ? plan.acceptingSubscribers
    : null;
}

export function acceptingSubscribersHint(accepting: boolean): string {
  return accepting
    ? 'Live and visible to customers.'
    : 'Hidden from new customers. Current subscribers are not affected.';
}
