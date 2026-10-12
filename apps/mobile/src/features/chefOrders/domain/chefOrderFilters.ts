import type {ChefOrdersStackRouteName} from '../../../app/navigation/types';
import type {ChefOperationalOrder, ChefOperationalOrderStatus} from '../../chefShell/api/chefOperationalApi';
import type {StatusChipTone} from '../../chefShell/components/ui/StatusChip';
import {formatDayLabel, formatRupees} from '../../chefShell/domain/chefFormat';

export type ChefOrderFilter = 'NEW' | 'PREPARING' | 'READY' | 'SCHEDULED' | 'PAST';

/** The row of filters at the top of Orders, in the order the board shows them. */
export const CHEF_ORDER_FILTERS: readonly {filter: ChefOrderFilter; label: string}[] = [
  {filter: 'NEW', label: 'New'},
  {filter: 'PREPARING', label: 'Preparing'},
  {filter: 'READY', label: 'Ready'},
  {filter: 'SCHEDULED', label: 'Scheduled'},
  {filter: 'PAST', label: 'Past'},
];

/** Every Orders-stack route shows the same screen; the route only says which filter is on. */
export const FILTER_FOR_ROUTE: Record<ChefOrdersStackRouteName, ChefOrderFilter> = {
  ChefOrdersNew: 'NEW',
  ChefOrdersPreparing: 'PREPARING',
  ChefOrdersReady: 'READY',
  ChefOrdersScheduled: 'SCHEDULED',
  ChefOrdersCompleted: 'PAST',
};

export const ROUTE_FOR_FILTER: Record<ChefOrderFilter, ChefOrdersStackRouteName> = {
  NEW: 'ChefOrdersNew',
  PREPARING: 'ChefOrdersPreparing',
  READY: 'ChefOrdersReady',
  SCHEDULED: 'ChefOrdersScheduled',
  PAST: 'ChefOrdersCompleted',
};

// PAYMENT_PENDING and PAID are not here: the chef is not asked about an order before it is paid and sent to the kitchen.
const FILTER_FOR_STATUS: Partial<Record<ChefOperationalOrderStatus, ChefOrderFilter>> = {
  CHEF_ACCEPTANCE_PENDING: 'NEW',
  CHEF_ACCEPTED: 'PREPARING',
  PREPARING: 'PREPARING',
  READY_FOR_PICKUP: 'READY',
  OUT_FOR_DELIVERY: 'PAST',
  DELIVERED: 'PAST',
  CHEF_REJECTED: 'PAST',
  CANCELLED: 'PAST',
  REFUND_PENDING: 'PAST',
  REFUNDED: 'PAST',
  REFUND_FAILED: 'PAST',
};

type OrderLike = Pick<ChefOperationalOrder, 'status' | 'updatedAt'>;

/** Past this long in Ready, nobody is coming for the order any more. */
const NOT_PICKED_UP_AFTER_MS = 24 * 3_600_000;

/** Still Ready more than a day after it last changed: it moves to Past as "Not picked up". */
export function isNotPickedUp(order: OrderLike, now: Date): boolean {
  const since = order.updatedAt ? Date.parse(order.updatedAt) : NaN;
  return order.status === 'READY_FOR_PICKUP' && !Number.isNaN(since) && now.getTime() - since > NOT_PICKED_UP_AFTER_MS;
}

/** The list an order belongs to, or null while it is not the chef's to see yet. */
export function chefOrderFilterOf(order: OrderLike, now: Date = new Date()): ChefOrderFilter | null {
  return isNotPickedUp(order, now) ? 'PAST' : FILTER_FOR_STATUS[order.status] ?? null;
}

const timeOf = (iso: string | null | undefined): number => {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(time) ? 0 : time;
};
/** When an order last changed, which for a finished order is when it finished. */
const orderTime = (order: ChefOperationalOrder): number => timeOf(order.updatedAt) || timeOf(order.createdAt);

/** The orders of one filter. New, Preparing and Ready put the longest-waiting first; Scheduled has its own list. */
export function ordersForFilter(
  orders: readonly ChefOperationalOrder[],
  filter: ChefOrderFilter,
  now: Date = new Date(),
): ChefOperationalOrder[] {
  const matching = orders.filter(order => chefOrderFilterOf(order, now) === filter);
  return filter === 'PAST'
    ? matching.sort((a, b) => orderTime(b) - orderTime(a))
    : matching.sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt));
}

export function chefOrderStatusChip(status: ChefOperationalOrderStatus): {label: string; tone: StatusChipTone} {
  switch (status) {
    case 'CHEF_ACCEPTANCE_PENDING':
      return {label: 'New', tone: 'new'};
    case 'CHEF_ACCEPTED':
    case 'PREPARING':
      return {label: 'Preparing', tone: 'cooking'};
    case 'READY_FOR_PICKUP':
      return {label: 'Ready', tone: 'ready'};
    case 'OUT_FOR_DELIVERY':
      return {label: 'On the way', tone: 'info'};
    case 'DELIVERED':
      return {label: 'Delivered', tone: 'ready'};
    case 'CHEF_REJECTED':
      return {label: 'Rejected', tone: 'done'};
    case 'CANCELLED':
    case 'REFUND_PENDING':
    case 'REFUNDED':
    case 'REFUND_FAILED':
      return {label: 'Cancelled', tone: 'cancelled'};
    case 'PAID':
      return {label: 'Paid', tone: 'info'};
    default:
      return {label: 'Waiting for payment', tone: 'info'};
  }
}

/** The chip an order wears on screen: its status, or "Not picked up" for an order left in Ready for over a day. */
export function chefOrderChip(order: OrderLike, now: Date = new Date()): {label: string; tone: StatusChipTone} {
  return isNotPickedUp(order, now) ? {label: 'Not picked up', tone: 'cancelled'} : chefOrderStatusChip(order.status);
}

/** NOT_PICKED_UP has no chip of its own on the board's filter row, so it shows under All only. */
export type PastOrderKind = 'DELIVERED' | 'ON_THE_WAY' | 'CANCELLED' | 'REJECTED' | 'NOT_PICKED_UP';
export type PastFilterKind = 'ALL' | PastOrderKind;

export const PAST_KINDS: readonly {kind: PastFilterKind; label: string}[] = [
  {kind: 'ALL', label: 'All'},
  {kind: 'DELIVERED', label: 'Delivered'},
  {kind: 'ON_THE_WAY', label: 'On the way'},
  {kind: 'CANCELLED', label: 'Cancelled'},
  {kind: 'REJECTED', label: 'Rejected'},
];

/** The chip a finished order is listed under. A refund only follows a cancelled order. */
export function pastKindOf(order: OrderLike, now: Date = new Date()): PastOrderKind {
  if (isNotPickedUp(order, now)) {
    return 'NOT_PICKED_UP';
  }
  switch (order.status) {
    case 'DELIVERED':
      return 'DELIVERED';
    case 'OUT_FOR_DELIVERY':
      return 'ON_THE_WAY';
    case 'CHEF_REJECTED':
      return 'REJECTED';
    default:
      return 'CANCELLED';
  }
}

export function filterPastOrders(
  orders: readonly ChefOperationalOrder[],
  kind: PastFilterKind,
  now: Date = new Date(),
): ChefOperationalOrder[] {
  return kind === 'ALL' ? [...orders] : orders.filter(order => pastKindOf(order, now) === kind);
}

/** Past orders from the live list plus older history. The live copy wins when an order is in both. */
export function mergePastOrders(
  live: readonly ChefOperationalOrder[],
  history: readonly ChefOperationalOrder[],
  now: Date = new Date(),
): ChefOperationalOrder[] {
  const byId = new Map<string, ChefOperationalOrder>();
  for (const order of [...history, ...live]) {
    if (chefOrderFilterOf(order, now) === 'PAST') {
      byId.set(order.id, order);
    }
  }
  return ordersForFilter([...byId.values()], 'PAST', now);
}

export interface PastOrderGroup {
  key: string;
  /** Today, Yesterday or a date. */
  title: string;
  count: number;
  /** Food total of the orders that were sold that day (delivered and on the way). Rejected and cancelled ones add nothing. */
  total: number;
  orders: ChefOperationalOrder[];
}

const SOLD_STATUSES = new Set<ChefOperationalOrderStatus>(['DELIVERED', 'OUT_FOR_DELIVERY']);

/** Past orders grouped by the local day they finished, newest day first. */
export function groupPastOrders(orders: readonly ChefOperationalOrder[], now: Date): PastOrderGroup[] {
  const groups = new Map<string, PastOrderGroup>();
  for (const order of [...orders].sort((a, b) => orderTime(b) - orderTime(a))) {
    const time = orderTime(order);
    const date = new Date(time);
    const key = time ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : 'unknown';
    const group = groups.get(key) ?? {key, title: time ? formatDayLabel(date, now) : 'Earlier', count: 0, total: 0, orders: []};
    group.orders.push(order);
    group.count += 1;
    if (SOLD_STATUSES.has(order.status)) {
      group.total = Math.round((group.total + (order.foodSubtotal ?? 0)) * 100) / 100;
    }
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** `Today · 8 orders · ₹1,240`; the total is left out when nothing was sold. */
export function pastGroupLabel(group: PastOrderGroup): string {
  return [group.title, `${group.count} ${group.count === 1 ? 'order' : 'orders'}`, group.total > 0 ? formatRupees(group.total) : null]
    .filter(Boolean)
    .join(' · ');
}
