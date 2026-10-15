import type { ChefEarning, ChefEarningStatus } from "./chef-earnings-contract";
import type { ChefOrder, ChefOrderStatus } from "./chef-order-contract";

/** A preset, or the first and last day picked (any instant on those India days). */
export type EarningsRange = "today" | "week" | "month" | { from: number; to: number };
/** `to` is the start of the day after the last day, so every period is whole India days. */
export type Bounds = { from: number; to: number };

export type EarningsSummary = {
  earned: number;
  delivered: number;
  averageOrder: number;
  byDay: { day: number; label: string; amount: number }[];
  topDishes: { name: string; sold: number; amount: number; menuItemId: string }[];
  split: { delivered: number; cancelled: number; rejected: number };
  /** Whole percent against the period before; null when that period earned nothing, or may be cut off. */
  changeVsPrevious: number | null;
  /** Delivered orders now minus the period before; null when the period before may be cut off. */
  deliveredChange: number | null;
};

export const DAY_MS = 86_400_000;
// India keeps no daylight saving, so a fixed offset gives exact India days whatever the browser's zone.
const IST_MS = 330 * 60_000;
/** The most older orders the page reads for a long range. */
export const MAX_HISTORY_ORDERS = 400;
/** The longest range that can be picked; the daily chart stays readable. */
export const MAX_RANGE_DAYS = 31;

// The same entries the ledger's "You earned" counts: approved money, not drafts and not reversed ones.
const EARNED = new Set<ChefEarningStatus>(["APPROVED", "SETTLEMENT_PENDING", "SETTLED"]);
const CANCELLED = new Set<ChefOrderStatus>([
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "REFUND_FAILED",
]);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TOP_DISHES = 3;

/** Start of the India day holding `time`. */
export function istDayStart(time: number): number {
  return Math.floor((time + IST_MS) / DAY_MS) * DAY_MS - IST_MS;
}
/** The India calendar date of `time`, read with getUTC*. */
const istDate = (time: number) => new Date(time + IST_MS);
const istMonthStart = (time: number, shift = 0) => {
  const date = istDate(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + shift, 1) - IST_MS;
};

/** "2026-10-12" (a date input's value) -> the start of that India day; null when not a date. */
export function istDayFromInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(time).getUTCDate() === Number(match[3]) ? time - IST_MS : null;
}
/** The India day of `time` as a date input's value. */
export function istInputValue(time: number): string {
  return istDate(time).toISOString().slice(0, 10);
}
/** "12 Oct". */
export function istDayText(time: number): string {
  const date = istDate(time);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}
/** "Today", "Yesterday" or "Mon, 12 Oct". */
export function istDayName(day: number, now: number): string {
  const today = istDayStart(now);
  if (day === today) return "Today";
  if (day === today - DAY_MS) return "Yesterday";
  return `${WEEKDAYS[istDate(day).getUTCDay()]}, ${istDayText(day)}`;
}

/** Whole India days a range covers. The week is the last 7 days including today; the month runs from the 1st. */
export function earningsRangeBounds(range: EarningsRange, now: number): Bounds {
  const today = istDayStart(now);
  if (range === "today") return { from: today, to: today + DAY_MS };
  if (range === "week") return { from: today - 6 * DAY_MS, to: today + DAY_MS };
  if (range === "month") return { from: istMonthStart(now), to: today + DAY_MS };
  const [first, last] = range.from <= range.to ? [range.from, range.to] : [range.to, range.from];
  return { from: istDayStart(first), to: istDayStart(last) + DAY_MS };
}

/** The period to compare with: the same number of days just before; for the month, the same days of last month. */
export function earningsPreviousBounds(range: EarningsRange, now: number): Bounds {
  const { from, to } = earningsRangeBounds(range, now);
  const days = Math.round((to - from) / DAY_MS);
  if (range === "month") {
    const previousFrom = istMonthStart(now, -1);
    return { from: previousFrom, to: Math.min(previousFrom + days * DAY_MS, from) };
  }
  return { from: from - days * DAY_MS, to: from };
}

/** "12 Oct" or "6 Oct – 12 Oct". */
export function periodText({ from, to }: Bounds): string {
  const last = to - DAY_MS;
  return last === from ? istDayText(from) : `${istDayText(from)} – ${istDayText(last)}`;
}

const timeOf = (iso: string | null | undefined) => {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(time) ? null : time;
};
const within = (time: number | null, { from, to }: Bounds) =>
  time !== null && time >= from && time < to;
/** An order counts on the day it last changed (delivered, cancelled), like the app. */
const orderTime = (order: ChefOrder) => timeOf(order.updatedAt) ?? timeOf(order.createdAt);
const paise = (amount: number) => Math.round(amount * 100) || 0;

function earnedPaise(entries: readonly ChefEarning[], bounds: Bounds): number {
  return entries
    .filter((entry) => EARNED.has(entry.status) && within(timeOf(entry.createdAt), bounds))
    .reduce((sum, entry) => sum + paise(entry.netPayable), 0);
}

/** Sales numbers for the Earnings page: money from the earnings entries, counts and dishes from the orders. */
export function summarizeEarnings(input: {
  orders: readonly ChefOrder[];
  earnings: readonly ChefEarning[];
  range: EarningsRange;
  now: number;
  /** The most entries the earnings read returns; a list this long may be missing its oldest entries. */
  earningsLimit?: number;
  /** The older orders did not all load, so the orders of the period before may be incomplete. */
  ordersCutOff?: boolean;
}): EarningsSummary {
  const { orders, earnings, range, now, earningsLimit, ordersCutOff } = input;
  const bounds = earningsRangeBounds(range, now);
  const previous = earningsPreviousBounds(range, now);
  const earnedTotal = earnedPaise(earnings, bounds);
  const previousTotal = earnedPaise(earnings, previous);
  // A full list may have lost its oldest entries: if none reaches back before the period to compare with,
  // that period may be incomplete, and a percentage against it would mislead.
  const oldestEntry = Math.min(...earnings.map((entry) => timeOf(entry.createdAt) ?? Infinity));
  const earningsCutOff =
    earningsLimit !== undefined && earnings.length >= earningsLimit && oldestEntry > previous.from;

  const inRange = orders.filter((order) => within(orderTime(order), bounds));
  const delivered = inRange.filter((order) => order.status === "DELIVERED");
  const split = {
    delivered: delivered.length,
    cancelled: inRange.filter((order) => CANCELLED.has(order.status)).length,
    rejected: inRange.filter((order) => order.status === "CHEF_REJECTED").length,
  };

  const dayCount = Math.round((bounds.to - bounds.from) / DAY_MS);
  const today = istDayStart(now);
  const byDay = Array.from({ length: dayCount }, (_, index) => {
    const day = bounds.from + index * DAY_MS;
    const label =
      day === today
        ? "Today"
        : dayCount <= 7
          ? WEEKDAYS[istDate(day).getUTCDay()]
          : String(istDate(day).getUTCDate());
    return { day, label, amount: earnedPaise(earnings, { from: day, to: day + DAY_MS }) / 100 };
  });

  const previousDelivered = orders.filter(
    (order) => order.status === "DELIVERED" && within(orderTime(order), previous),
  ).length;

  // The web order lines carry their own totals, so a dish's rupees are exact.
  const dishes = new Map<
    string,
    { name: string; sold: number; amount: number; menuItemId: string }
  >();
  for (const order of delivered) {
    for (const item of order.items) {
      if (item.quantity <= 0) continue;
      const key = item.itemName.trim().toLowerCase();
      const dish = dishes.get(key) ?? {
        name: item.itemName.trim(),
        sold: 0,
        amount: 0,
        menuItemId: item.menuItemId,
      };
      dish.sold += item.quantity;
      dish.amount += paise(item.lineTotal);
      dishes.set(key, dish);
    }
  }
  const topDishes = [...dishes.values()]
    .map((dish) => ({ ...dish, amount: dish.amount / 100 }))
    .sort((a, b) => b.sold - a.sold || b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, TOP_DISHES);

  return {
    earned: earnedTotal / 100,
    delivered: delivered.length,
    averageOrder: delivered.length > 0 ? Math.round(earnedTotal / delivered.length) / 100 : 0,
    byDay,
    topDishes,
    split,
    changeVsPrevious:
      !earningsCutOff && previousTotal > 0
        ? Math.round(((earnedTotal - previousTotal) / previousTotal) * 100)
        : null,
    deliveredChange: earningsCutOff || ordersCutOff ? null : delivered.length - previousDelivered,
  };
}

/** The orders that last changed on one India day, newest first: what a tap on that day's bar lists. */
export function ordersOnDay(orders: readonly ChefOrder[], day: number): ChefOrder[] {
  const bounds = { from: istDayStart(day), to: istDayStart(day) + DAY_MS };
  return orders
    .filter((order) => within(orderTime(order), bounds))
    .sort((a, b) => (orderTime(b) ?? 0) - (orderTime(a) ?? 0));
}

/** True while more older orders exist and the oldest one loaded is still inside the range (newest first). */
export function olderOrdersMissing({
  historyOrders,
  hasMore,
  from,
}: {
  historyOrders: readonly ChefOrder[];
  hasMore: boolean;
  from: number;
}): boolean {
  if (!hasMore || historyOrders.length === 0) return false;
  const oldest = timeOf(historyOrders[historyOrders.length - 1].createdAt);
  return oldest !== null && oldest >= from;
}

/**
 * Whether the orders held (the live list, only the latest ones, plus the older pages read so far) are known to reach
 * back to `from`, so counts over a period starting there are not understated: an order from before `from` is held,
 * or the older pages ran out with at least one order. Anything else (no older orders at all, a failed or unfinished
 * read) is not known, and is false.
 */
export function ordersCoverFrom(input: {
  liveOrders: readonly ChefOrder[];
  historyOrders: readonly ChefOrder[];
  hasMore: boolean;
  historyFailed: boolean;
  from: number;
}): boolean {
  const { liveOrders, historyOrders, hasMore, historyFailed, from } = input;
  const reaches = (list: readonly ChefOrder[]) =>
    list.some((order) => (timeOf(order.createdAt) ?? Infinity) < from);
  if (reaches(liveOrders) || reaches(historyOrders)) return true;
  if (historyFailed || historyOrders.length === 0) return false;
  return !hasMore;
}
