import type {ChefOperationalNotice, ChefOperationalOrder} from '../api/chefOperationalApi';

export interface ChefOperationalCounters {
  pendingAcceptance: number;
  activeOrders: number;
  readyForPickup: number;
  unreadNotifications: number;
}

const ACTIVE_ORDER_STATUSES = new Set<ChefOperationalOrder['status']>([
  'CHEF_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
]);

export function deriveChefOperationalCounters(
  orders: readonly ChefOperationalOrder[],
  notices: readonly ChefOperationalNotice[],
): ChefOperationalCounters {
  let pendingAcceptance = 0;
  let activeOrders = 0;
  let readyForPickup = 0;

  for (const order of orders) {
    if (order.status === 'CHEF_ACCEPTANCE_PENDING') pendingAcceptance += 1;
    if (ACTIVE_ORDER_STATUSES.has(order.status)) activeOrders += 1;
    if (order.status === 'READY_FOR_PICKUP') readyForPickup += 1;
  }

  return {
    pendingAcceptance,
    activeOrders,
    readyForPickup,
    unreadNotifications: notices.reduce(
      (count, notice) => count + (notice.readAt === null ? 1 : 0),
      0,
    ),
  };
}

export function chefCounterBadgeLabel(count: number): string | null {
  if (!Number.isInteger(count) || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}
