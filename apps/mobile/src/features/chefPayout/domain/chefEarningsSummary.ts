import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import type {ChefEarningLedgerEntry, ChefEarningStatus} from '../api/chefPayoutApi';

export type EarningsRange = 'today' | 'week' | 'month' | {from: Date; to: Date};

export interface EarningsSummary {
  earned: number;
  delivered: number;
  averageOrder: number;
  byDay: {label: string; amount: number}[];
  topDishes: {name: string; sold: number; amount: number}[];
  split: {delivered: number; cancelled: number; rejected: number};
  /** Whole percent against the period before; null when that period earned nothing to compare with. */
  changeVsPrevious: number | null;
}

/** The same entries the Home "Today" card counts: approved money, not drafts and not reversed ones. */
const EARNED_STATUSES = new Set<ChefEarningStatus>(['APPROVED', 'SETTLEMENT_PENDING', 'SETTLED']);
const CANCELLED_STATUSES = new Set<ChefOperationalOrder['status']>(['CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED']);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TOP_DISHES = 3;
/** Most older orders the Earnings tab pulls in for a long range. */
const MAX_HISTORY_ORDERS = 400;

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
function previousBounds(range: EarningsRange, now: Date): Bounds {
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
}): EarningsSummary {
  const {orders, earnings, range, now} = input;
  const bounds = earningsRangeBounds(range, now);
  const earnedTotal = earnedPaise(earnings, bounds);
  const previousTotal = earnedPaise(earnings, previousBounds(range, now));

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

  const dishes = new Map<string, {name: string; sold: number; amount: number}>();
  for (const order of delivered) {
    const items = (order.items ?? []).filter(item => item.quantity > 0);
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    for (const item of items) {
      const key = item.itemName.trim().toLowerCase();
      const dish = dishes.get(key) ?? {name: item.itemName.trim(), sold: 0, amount: 0};
      dish.sold += item.quantity;
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
    changeVsPrevious: previousTotal > 0 ? Math.round(((earnedTotal - previousTotal) / previousTotal) * 100) : null,
  };
}

/** True while the older-orders list (newest first) has not yet reached back to the start of the range. */
export function needsOlderOrders(input: {
  historyOrders: readonly ChefOperationalOrder[];
  hasNextPage: boolean;
  from: Date;
}): boolean {
  const {historyOrders, hasNextPage, from} = input;
  if (!hasNextPage || historyOrders.length === 0 || historyOrders.length >= MAX_HISTORY_ORDERS) return false;
  const oldest = timeOf(historyOrders[historyOrders.length - 1].createdAt);
  return oldest !== null && oldest >= from.getTime();
}
