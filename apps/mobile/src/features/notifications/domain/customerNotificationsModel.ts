import {isInboundResourceId} from '../../../app/navigation/inboundRouting';
import type {CustomerNotice} from '../../customerShell/api/customerShellApi';

export type CustomerNotificationCategory =
  | 'ALL'
  | 'ORDERS'
  | 'OFFERS'
  | 'UPDATES'
  | 'OTHER';

export interface CustomerNotificationCategoryDefinition {
  id: CustomerNotificationCategory;
  label: string;
}

export const CUSTOMER_NOTIFICATION_CATEGORIES: readonly CustomerNotificationCategoryDefinition[] = [
  {id: 'ALL', label: 'All'},
  {id: 'ORDERS', label: 'Orders'},
  {id: 'OFFERS', label: 'Offers'},
  {id: 'UPDATES', label: 'Updates'},
  {id: 'OTHER', label: 'Other'},
] as const;

export type CustomerNotificationDestination =
  | {route: 'CustomerOrderDetail'; orderId: string}
  | {route: 'CustomerOrderTracking'; orderId: string}
  | {route: 'CustomerKitchenProfile'; kitchenId: string};

export interface CustomerNotificationGroup {
  title: 'Today' | 'Earlier';
  notices: CustomerNotice[];
}

function normalizedToken(value: string | null): string {
  return value?.trim().toUpperCase() ?? '';
}

export function resolveCustomerNotificationCategory(
  notice: CustomerNotice,
): Exclude<CustomerNotificationCategory, 'ALL'> {
  const targetType = normalizedToken(notice.targetType);
  const noticeType = normalizedToken(notice.noticeType);

  if (targetType === 'ORDER' || targetType === 'DELIVERY') {
    return 'ORDERS';
  }
  if (
    targetType === 'OFFER' ||
    targetType === 'COUPON' ||
    noticeType.includes('OFFER') ||
    noticeType.includes('COUPON') ||
    noticeType.includes('PROMO') ||
    noticeType.includes('DISCOUNT')
  ) {
    return 'OFFERS';
  }
  if (
    targetType === 'KITCHEN' ||
    targetType === 'REWARD' ||
    targetType === 'ACCOUNT' ||
    targetType === 'SYSTEM' ||
    noticeType.includes('KITCHEN') ||
    noticeType.includes('REWARD') ||
    noticeType.includes('ACCOUNT') ||
    noticeType.includes('SYSTEM')
  ) {
    return 'UPDATES';
  }
  return 'OTHER';
}

export function normalizeCustomerNotifications(
  notices: readonly CustomerNotice[],
): CustomerNotice[] {
  const byId = new Map<string, CustomerNotice>();
  notices.forEach(notice => {
    if (!byId.has(notice.id)) {
      byId.set(notice.id, notice);
    }
  });
  return Array.from(byId.values()).sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}

export function filterCustomerNotifications(
  notices: readonly CustomerNotice[],
  category: CustomerNotificationCategory,
): CustomerNotice[] {
  if (category === 'ALL') {
    return [...notices];
  }
  return notices.filter(
    notice => resolveCustomerNotificationCategory(notice) === category,
  );
}

export function buildCustomerNotificationCategoryCounts(
  notices: readonly CustomerNotice[],
): Record<CustomerNotificationCategory, number> {
  const counts: Record<CustomerNotificationCategory, number> = {
    ALL: notices.length,
    ORDERS: 0,
    OFFERS: 0,
    UPDATES: 0,
    OTHER: 0,
  };
  notices.forEach(notice => {
    counts[resolveCustomerNotificationCategory(notice)] += 1;
  });
  return counts;
}

function sameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function groupCustomerNotifications(
  notices: readonly CustomerNotice[],
  now = new Date(),
): CustomerNotificationGroup[] {
  const today: CustomerNotice[] = [];
  const earlier: CustomerNotice[] = [];
  notices.forEach(notice => {
    const created = new Date(notice.createdAt);
    (sameLocalDay(created, now) ? today : earlier).push(notice);
  });

  const groups: CustomerNotificationGroup[] = [];
  if (today.length > 0) {
    groups.push({title: 'Today', notices: today});
  }
  if (earlier.length > 0) {
    groups.push({title: 'Earlier', notices: earlier});
  }
  return groups;
}

export function formatCustomerNotificationTimestamp(
  createdAt: string,
  now = new Date(),
): string {
  const created = new Date(createdAt);
  if (sameLocalDay(created, now)) {
    return new Intl.DateTimeFormat('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(created);
  }
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
  }).format(created);
}

/**
 * Notification payloads are untrusted. Only server-issued UUID target IDs and
 * this explicit target-type allowlist can create an in-app destination.
 */
export function resolveCustomerNotificationDestination(
  notice: CustomerNotice,
): CustomerNotificationDestination | null {
  if (!isInboundResourceId(notice.targetId)) {
    return null;
  }
  switch (normalizedToken(notice.targetType)) {
    case 'ORDER':
      return {route: 'CustomerOrderDetail', orderId: notice.targetId};
    case 'DELIVERY':
      return {route: 'CustomerOrderTracking', orderId: notice.targetId};
    case 'KITCHEN':
      return {route: 'CustomerKitchenProfile', kitchenId: notice.targetId};
    default:
      return null;
  }
}

export function applyCustomerNotificationRead(
  notices: readonly CustomerNotice[],
  noticeId: string,
  readAt: string,
): CustomerNotice[] {
  return notices.map(notice =>
    notice.id === noticeId && notice.readAt === null
      ? {...notice, readAt}
      : notice,
  );
}
