import type {
  CustomerOrder,
  CustomerOrderMoney,
  CustomerOrderStatus,
  CustomerOrdersSnapshot,
} from '../domain/customerOrderTypes';

export type CustomerOrdersTabKey =
  | 'ALL'
  | 'UPCOMING'
  | 'COMPLETED'
  | 'CANCELLED';

export interface CustomerOrdersTabDefinition {
  key: CustomerOrdersTabKey;
  label: string;
}

export const CUSTOMER_ORDERS_TABS: readonly CustomerOrdersTabDefinition[] = [
  {key: 'ALL', label: 'All Orders'},
  {key: 'UPCOMING', label: 'Upcoming'},
  {key: 'COMPLETED', label: 'Completed'},
  {key: 'CANCELLED', label: 'Cancelled'},
] as const;

/**
 * Kept only for backwards-compatible imports in the screen shell. The lifecycle
 * buckets below are authoritative now, so the blocked UI path is unreachable.
 */
export const CUSTOMER_ORDERS_LIFECYCLE_BUCKET_BLOCKER =
  'CUSTOMER_ORDERS_LIFECYCLE_BUCKET_MAPPING_AVAILABLE';

export type CustomerOrderStatusTone =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';

export interface CustomerOrderStatusPresentation {
  label: string;
  tone: CustomerOrderStatusTone;
}

export interface CustomerOrderProgressPresentation {
  label: string;
  tone: CustomerOrderStatusTone;
  icon: 'clock' | 'check';
}

export type CustomerOrderReferenceAction = 'TRACK' | 'REORDER' | null;

const UPCOMING_STATUSES = new Set<CustomerOrderStatus>([
  'PAYMENT_PENDING',
  'PAID',
  'CHEF_ACCEPTANCE_PENDING',
  'CHEF_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
]);

const COMPLETED_STATUSES = new Set<CustomerOrderStatus>(['DELIVERED']);

const CANCELLED_STATUSES = new Set<CustomerOrderStatus>([
  'CHEF_REJECTED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'REFUND_FAILED',
]);

/**
 * Every tab is derived from the exact Order Service lifecycle statuses.
 * No order is dropped: terminal refund/rejection states stay visible under the
 * Cancelled bucket while Delivered is the only Completed state.
 */
export function isCustomerOrdersTabAuthoritative(
  _tab: CustomerOrdersTabKey,
): boolean {
  return true;
}

export function selectCustomerOrdersTab(
  snapshot: CustomerOrdersSnapshot,
  tab: CustomerOrdersTabKey,
): readonly CustomerOrder[] {
  if (tab === 'ALL') {
    return snapshot.orders;
  }

  const allowed =
    tab === 'UPCOMING'
      ? UPCOMING_STATUSES
      : tab === 'COMPLETED'
        ? COMPLETED_STATUSES
        : CANCELLED_STATUSES;
  return snapshot.orders.filter(order => allowed.has(order.status));
}

export function getCustomerOrderStatusPresentation(
  status: CustomerOrderStatus,
): CustomerOrderStatusPresentation {
  switch (status) {
    case 'PAYMENT_PENDING':
      return {label: 'Payment pending', tone: 'warning'};
    case 'PAID':
      return {label: 'Awaiting chef', tone: 'warning'};
    case 'CHEF_ACCEPTANCE_PENDING':
      return {label: 'Awaiting chef', tone: 'warning'};
    case 'CHEF_ACCEPTED':
      return {label: 'Chef accepted', tone: 'accent'};
    case 'PREPARING':
      return {label: 'Preparing', tone: 'accent'};
    case 'READY_FOR_PICKUP':
      return {label: 'Ready for pickup', tone: 'success'};
    case 'OUT_FOR_DELIVERY':
      return {label: 'Item picked up', tone: 'accent'};
    case 'DELIVERED':
      return {label: 'Delivered', tone: 'success'};
    case 'CHEF_REJECTED':
      return {label: 'Chef declined', tone: 'danger'};
    case 'CANCELLED':
      return {label: 'Cancelled', tone: 'muted'};
    case 'REFUND_PENDING':
      return {label: 'Refund pending', tone: 'warning'};
    case 'REFUNDED':
      return {label: 'Refunded', tone: 'muted'};
    case 'REFUND_FAILED':
      return {label: 'Refund needs attention', tone: 'danger'};
  }
}

function parseTimestamp(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatClockTime(value: string): string {
  const date = parseTimestamp(value);
  if (!date) return value;
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDayMonthTime(value: string): string {
  const date = parseTimestamp(value);
  if (!date) return value;
  const day = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  return `${day}, ${formatClockTime(value)}`;
}

export function getCustomerOrderProgressPresentation(
  order: CustomerOrder,
): CustomerOrderProgressPresentation {
  switch (order.status) {
    case 'DELIVERED':
      return {
        label: `Delivered on ${formatClockTime(order.updatedAt)}`,
        tone: 'success',
        icon: 'check',
      };
    case 'CANCELLED':
    case 'CHEF_REJECTED':
      return {
        label: `Cancelled on ${formatDayMonthTime(order.updatedAt)}`,
        tone: 'muted',
        icon: 'clock',
      };
    case 'REFUND_PENDING':
      return {label: 'Refund is being processed', tone: 'warning', icon: 'clock'};
    case 'REFUNDED':
      return {label: 'Refund completed', tone: 'muted', icon: 'check'};
    case 'REFUND_FAILED':
      return {label: 'Refund needs attention', tone: 'danger', icon: 'clock'};
    case 'PAYMENT_PENDING':
      return {
        label: 'Estimated delivery after payment confirmation',
        tone: 'muted',
        icon: 'clock',
      };
    case 'PAID':
    case 'CHEF_ACCEPTANCE_PENDING':
      return {
        label: 'Estimated delivery after chef confirmation',
        tone: 'muted',
        icon: 'clock',
      };
    case 'CHEF_ACCEPTED':
    case 'PREPARING':
      return {
        label: order.prepTimeMinutes
          ? `Estimated delivery • ${order.prepTimeMinutes} min preparation`
          : 'Estimated delivery is being updated',
        tone: 'accent',
        icon: 'clock',
      };
    case 'READY_FOR_PICKUP':
      return {label: 'Waiting for pickup', tone: 'success', icon: 'check'};
    case 'OUT_FOR_DELIVERY':
      return {label: 'Delivery in progress', tone: 'accent', icon: 'clock'};
  }
}

export function getCustomerOrderReferenceAction(
  status: CustomerOrderStatus,
): CustomerOrderReferenceAction {
  switch (status) {
    case 'PREPARING':
    case 'READY_FOR_PICKUP':
    case 'OUT_FOR_DELIVERY':
      return 'TRACK';
    case 'DELIVERED':
      return 'REORDER';
    default:
      return null;
  }
}

export function formatCustomerOrderMoney(money: CustomerOrderMoney): string {
  const numericAmount = Number(money.amount);
  const amount = Number.isFinite(numericAmount)
    ? numericAmount.toFixed(Number.isInteger(numericAmount) ? 0 : 2)
    : money.amount;

  if (money.currency === 'INR') {
    return `₹${amount}`;
  }

  return `${money.currency} ${amount}`;
}

export function getCustomerOrderDisplayReference(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function formatCustomerOrderCreatedAt(
  createdAt: string,
  now: Date = new Date(),
): string {
  const date = parseTimestamp(createdAt);
  if (!date) {
    return createdAt;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const dayLabel = isSameCalendarDay(date, now)
    ? 'Today'
    : isSameCalendarDay(date, yesterday)
      ? 'Yesterday'
      : date.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        });

  return `${dayLabel}, ${formatClockTime(createdAt)}`;
}
