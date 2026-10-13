import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import type {ChefEarningLedgerEntry, ChefEarningStatus} from '../api/chefPayoutApi';

export type EarningsRange = 'today' | 'week' | 'month' | {from: Date; to: Date};

export interface EarningsSummary {
  earned: number;
  delivered: number;
  averageOrder: number;
  byDay: {label: string; amount: number}[];
  topDishes: {name: string; sold: number; amount: number; menuItemId?: string}[];
  split: {delivered: number; cancelled: number; rejected: number};
  /** Whole percent against the period before; null when that period earned nothing to compare with, or may be cut off. */
  changeVsPrevious: number | null;
  /** Delivered orders now minus the period before; null when the period before may be cut off. */
  deliveredChange: number | null;
}

/** The same entries the Home "Today" card counts: approved money, not drafts and not reversed ones. */
const EARNED_STATUSES = new Set<ChefEarningStatus>(['APPROVED', 'SETTLEMENT_PENDING', 'SETTLED']);
const CANCELLED_STATUSES = new Set<ChefOperationalOrder['status']>(['CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED']);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TOP_DISHES = 3;
/** Most older orders the Earnings tab pulls in for a long range. */
export const MAX_HISTORY_ORDERS = 400;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86_400_000);
const timeOf = (iso: string | null | undefined) => {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(time) ? null : time;
};

interface Bounds {
  from: Date;
  /** Start of the day after the last day, so every period is whole days. */
  to: Date;
}

/** Whole days a range covers. The week is the last 7 days including today; the month runs from the 1st. */
export function earningsRangeBounds(range: EarningsRange, now: Date): Bounds {
  const tomorrow = addDays(startOfDay(now), 1);
  if (range === 'today') return {from: startOfDay(now), to: tomorrow};
  if (range === 'week') return {from: addDays(startOfDay(now), -6), to: tomorrow};
  if (range === 'month') return {from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow};
  const [first, last] = range.from <= range.to ? [range.from, range.to] : [range.to, range.from];
  return {from: startOfDay(first), to: addDays(startOfDay(last), 1)};
}

/** The period to compare with: the same number of days just before; for the month, the same days of last month. */
export function earningsPreviousBounds(range: EarningsRange, now: Date): Bounds {
  const {from, to} = earningsRangeBounds(range, now);
  const days = daysBetween(from, to);
  if (range === 'month') {
    const previousFrom = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const previousTo = addDays(previousFrom, days);
    return {from: previousFrom, to: previousTo > from ? from : previousTo};
  }
  return {from: addDays(from, -days), to: from};
}

const within = (time: number | null, {from, to}: Bounds) => time !== null && time >= from.getTime() && time < to.getTime();
const orderTime = (order: ChefOperationalOrder) => timeOf(order.updatedAt) ?? timeOf(order.createdAt);
const paise = (amount: string) => Math.round(Number(amount) * 100) || 0;

function earnedPaise(entries: readonly ChefEarningLedgerEntry[], bounds: Bounds): number {
  return entries
    .filter(entry => EARNED_STATUSES.has(entry.status) && within(timeOf(entry.createdAt), bounds))
    .reduce((sum, entry) => sum + paise(entry.netPayable), 0);
}

function dayLabel(day: Date, count: number, now: Date): string {
  if (day.getTime() === startOfDay(now).getTime()) return 'Today';
  return count <= 7 ? WEEKDAYS[day.getDay()] : String(day.getDate());
}

/**
 * Sales numbers for the Earnings tab, worked out on the phone: money from the earnings entries, counts from the orders.
 * shortcut: the order list carries no per-dish prices, so a dish's rupees are its quantity share of the order's food
 * subtotal (exact for one-dish orders); give the order items a price when the server sends one.
 */
export function summarizeEarnings(input: {
  orders: readonly ChefOperationalOrder[];
  earnings: readonly ChefEarningLedgerEntry[];
  range: EarningsRange;
  now: Date;
  /** The most entries the earnings read returns; a list this long may be missing its oldest entries. */
  earningsLimit?: number;
  /** The older orders did not all load, so the orders of the period before may be incomplete. */
  ordersCutOff?: boolean;
}): EarningsSummary {
  const {orders, earnings, range, now, earningsLimit, ordersCutOff} = input;
  const bounds = earningsRangeBounds(range, now);
  const previous = earningsPreviousBounds(range, now);
  const earnedTotal = earnedPaise(earnings, bounds);
  const previousTotal = earnedPaise(earnings, previous);
  // A full list may have lost its oldest entries: if none reaches back before the period to compare with, that
  // period may be incomplete, and a percentage against it would mislead.
  const oldestEntry = Math.min(...earnings.map(entry => timeOf(entry.createdAt) ?? Infinity));
  const earningsCutOff = earningsLimit !== undefined && earnings.length >= earningsLimit && oldestEntry > previous.from.getTime();

  const inRange = orders.filter(order => within(orderTime(order), bounds));
  const delivered = inRange.filter(order => order.status === 'DELIVERED');
  const split = {
    delivered: delivered.length,
    cancelled: inRange.filter(order => CANCELLED_STATUSES.has(order.status)).length,
    rejected: inRange.filter(order => order.status === 'CHEF_REJECTED').length,
  };

  const dayCount = daysBetween(bounds.from, bounds.to);
  const byDay = Array.from({length: dayCount}, (_, index) => {
    const day = addDays(bounds.from, index);
    const next = addDays(day, 1);
    return {label: dayLabel(day, dayCount, now), amount: earnedPaise(earnings, {from: day, to: next}) / 100};
  });

  const previousDelivered = orders.filter(order => order.status === 'DELIVERED' && within(orderTime(order), previous)).length;

  const dishes = new Map<string, {name: string; sold: number; amount: number; menuItemId?: string}>();
  for (const order of delivered) {
    const items = (order.items ?? []).filter(item => item.quantity > 0);
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    for (const item of items) {
      const key = item.itemName.trim().toLowerCase();
      const dish = dishes.get(key) ?? {name: item.itemName.trim(), sold: 0, amount: 0};
      dish.sold += item.quantity;
      dish.menuItemId ??= item.menuItemId;
      dish.amount += ((order.foodSubtotal ?? 0) * item.quantity) / quantity;
      dishes.set(key, dish);
    }
  }
  const topDishes = [...dishes.values()]
    .map(dish => ({...dish, amount: Math.round(dish.amount * 100) / 100}))
    .sort((a, b) => b.sold - a.sold || b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, TOP_DISHES);

  const earned = earnedTotal / 100;
  return {
    earned,
    delivered: delivered.length,
    averageOrder: delivered.length > 0 ? Math.round(earnedTotal / delivered.length) / 100 : 0,
    byDay,
    topDishes,
    split,
    changeVsPrevious:
      !earningsCutOff && previousTotal > 0 ? Math.round(((earnedTotal - previousTotal) / previousTotal) * 100) : null,
    deliveredChange: earningsCutOff || ordersCutOff ? null : delivered.length - previousDelivered,
  };
}

/** The orders that last changed on one local day, newest first: what a tap on that day's bar lists. */
export function ordersOnDay(orders: readonly ChefOperationalOrder[], day: Date): ChefOperationalOrder[] {
  const bounds = {from: startOfDay(day), to: addDays(startOfDay(day), 1)};
  return orders
    .filter(order => within(orderTime(order), bounds))
    .sort((a, b) => (orderTime(b) ?? 0) - (orderTime(a) ?? 0));
}

/** True while more older orders exist and the oldest one loaded is still inside the range (newest first). */
export function olderOrdersMissing(input: {
  historyOrders: readonly ChefOperationalOrder[];
  hasNextPage: boolean;
  from: Date;
}): boolean {
  const {historyOrders, hasNextPage, from} = input;
  if (!hasNextPage || historyOrders.length === 0) return false;
  const oldest = timeOf(historyOrders[historyOrders.length - 1].createdAt);
  return oldest !== null && oldest >= from.getTime();
}

/** Ask for another page: older orders are missing and the cap has not been reached. */
export function needsOlderOrders(input: Parameters<typeof olderOrdersMissing>[0]): boolean {
  return input.historyOrders.length < MAX_HISTORY_ORDERS && olderOrdersMissing(input);
}
