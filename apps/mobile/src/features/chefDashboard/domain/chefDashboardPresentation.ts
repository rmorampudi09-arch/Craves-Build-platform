import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {DEFAULT_PREPARATION_MINUTES} from '../../chefOrders/domain/chefOrderPreparation';
import type {ChefDashboardEarning, ChefDashboardMenuItem} from '../api/chefDashboardApi';

const EARNED_STATUSES = new Set<ChefDashboardEarning['status']>(['APPROVED', 'SETTLEMENT_PENDING', 'SETTLED']);
const IN_KITCHEN_STATUSES = new Set<ChefOperationalOrder['status']>(['CHEF_ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']);

const timeOf = (iso: string | null | undefined) => {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(time) ? 0 : time;
};

function isToday(iso: string | null | undefined, now: Date): boolean {
  return iso != null && !Number.isNaN(Date.parse(iso)) && new Date(iso).toDateString() === now.toDateString();
}

/** Rupees the chef earned today, from the earnings entries created today (draft and reversed ones do not count). */
export function earnedToday(entries: readonly ChefDashboardEarning[], now: Date): number {
  const total = entries
    .filter(entry => EARNED_STATUSES.has(entry.status) && isToday(entry.createdAt, now))
    .reduce((sum, entry) => sum + entry.netPayable, 0);
  return Math.round(total * 100) / 100;
}

export function deliveredToday(orders: readonly ChefOperationalOrder[], now: Date): number {
  return orders.filter(order => order.status === 'DELIVERED' && isToday(order.updatedAt, now)).length;
}

/** New orders to answer (oldest first, the one closest to its deadline) and orders now in the kitchen. */
export function splitHomeOrders(orders: readonly ChefOperationalOrder[]): {
  pending: ChefOperationalOrder[];
  inKitchen: ChefOperationalOrder[];
} {
  return {
    pending: orders
      .filter(order => order.status === 'CHEF_ACCEPTANCE_PENDING')
      .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt)),
    inKitchen: orders
      .filter(order => IN_KITCHEN_STATUSES.has(order.status))
      .sort((a, b) => timeOf(a.updatedAt) - timeOf(b.updatedAt)),
  };
}

/**
 * Minutes the Accept button promises. Same rule the accept action applies when it sends the order:
 * the time the server already holds, else the longest dish, else the default.
 */
export function acceptReadyMinutes(order: ChefOperationalOrder, menuItems: readonly ChefDashboardMenuItem[]): number {
  if (order.prepTimeMinutes != null) {
    return order.prepTimeMinutes;
  }
  const byId = new Map(menuItems.map(item => [item.id, item.preparationTimeMinutes]));
  const byName = new Map(menuItems.map(item => [item.itemName.trim().toLowerCase(), item.preparationTimeMinutes]));
  const minutes = (order.items ?? []).map(
    item =>
      (item.menuItemId ? byId.get(item.menuItemId) : null) ??
      byName.get(item.itemName.trim().toLowerCase()) ??
      DEFAULT_PREPARATION_MINUTES,
  );
  return minutes.length === 0 ? DEFAULT_PREPARATION_MINUTES : Math.max(...minutes);
}
