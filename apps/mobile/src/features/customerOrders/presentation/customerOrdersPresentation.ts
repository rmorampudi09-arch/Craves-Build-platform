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
      return {label: 'Paid', tone: 'accent'};
    case 'CHEF_ACCEPTANCE_PENDING':
      return {label: 'Awaiting chef', tone: 'warning'};
    case 'CHEF_ACCEPTED':
      return {label: 'Chef accepted', tone: 'accent'};
    case 'PREPARING':
      return {label: 'Preparing', tone: 'accent'};
    case 'READY_FOR_PICKUP':
      return {label: 'Ready for pickup', tone: 'accent'};
    case 'OUT_FOR_DELIVERY':
      return {label: 'Out for delivery', tone: 'accent'};
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

export function formatCustomerOrderCreatedAt(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
