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

export const CUSTOMER_ORDERS_LIFECYCLE_BUCKET_BLOCKER =
  'CUSTOMER_ORDERS_LIFECYCLE_BUCKET_MAPPING_UNAVAILABLE';

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

export function isCustomerOrdersTabAuthoritative(
  tab: CustomerOrdersTabKey,
): boolean {
  return tab === 'ALL';
}

export function selectCustomerOrdersTab(
  snapshot: CustomerOrdersSnapshot,
  tab: CustomerOrdersTabKey,
): readonly CustomerOrder[] {
  if (tab === 'ALL') {
    return snapshot.orders;
  }

  // The current backend exposes exact raw statuses but no approved mapping from
  // them into the guide's Upcoming/Completed/Cancelled lifecycle buckets.
  // Returning an empty blocked view is safer than silently inventing product
  // semantics that could hide or misclassify a real customer order.
  return [];
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

/**
 * Mirrors only the visible reference-action label. P55 wires TRACK to the exact
 * owned-order delivery-status route. REORDER still does not grant eligibility;
 * P56 owns the authoritative reorder validation and cart-conflict policy.
 */
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
