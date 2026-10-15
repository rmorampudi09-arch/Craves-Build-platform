// The live order bubble's model, ported from the app (features/liveOrder/liveOrderModel.ts). Browser-safe.
import { shortOrderNumber } from "./order-number.ts";

export const LIVE_ORDER_STEPS = ["Accepted", "Cooked", "On the way", "Delivered"] as const;

/** Orders the chef has accepted that are not delivered yet: the short status, the order page's title and how many steps are done. */
const LIVE_STATUSES: Record<string, { status: string; title: string; doneSteps: number }> = {
  CHEF_ACCEPTED: { status: "Accepted", title: "Chef accepted", doneSteps: 1 },
  PREPARING: { status: "Cooking", title: "Preparing your food", doneSteps: 1 },
  READY_FOR_PICKUP: { status: "Ready", title: "Ready for pickup", doneSteps: 2 },
  OUT_FOR_DELIVERY: { status: "On the way", title: "On the way", doneSteps: 3 },
};

/** An order still "in progress" this long after it was placed is stuck, not live: no bubble for it. */
const LIVE_ORDER_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type LiveOrderItem = { id: string; itemName: string; quantity: number; price: string };
export type LiveOrder = {
  orderId: string;
  kitchenName: string;
  status: string;
  title: string;
  reference: string;
  doneSteps: number;
  paid: string;
  items: LiveOrderItem[];
};

type SourceItem = { id: string; itemName: string; quantity: number; lineTotal: number };
type Source = {
  id: string;
  kitchenName: string;
  status: string;
  createdAt: string;
  grandTotal: number;
  currency: string;
  items: SourceItem[];
};

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function isItem(value: unknown): value is SourceItem {
  const raw = value as Partial<SourceItem> | null;
  return (
    !!raw &&
    isText(raw.id) &&
    isText(raw.itemName) &&
    Number.isInteger(raw.quantity) &&
    raw.quantity! > 0 &&
    isAmount(raw.lineTotal)
  );
}

/** The fields the bubble shows, from one entry of GET /api/orders (already checked by the BFF; anything else is skipped). */
function isSource(value: unknown): value is Source {
  const raw = value as Partial<Source> | null;
  return (
    !!raw &&
    isText(raw.id) &&
    isText(raw.kitchenName) &&
    isText(raw.status) &&
    isText(raw.currency) &&
    isAmount(raw.grandTotal) &&
    isText(raw.createdAt) &&
    !Number.isNaN(Date.parse(raw.createdAt)) &&
    Array.isArray(raw.items) &&
    raw.items.every(isItem)
  );
}

/** "₹48.25", "₹240": the app's order money format. */
export function formatLiveOrderMoney(amount: number, currency: string): string {
  const value = amount.toFixed(Number.isInteger(amount) ? 0 : 2);
  return currency === "INR" ? `₹${value}` : `${currency} ${value}`;
}

/** The newest order in progress, ready to show; null when nothing is cooking or on the way. */
export function getLiveOrder(orders: unknown, now = Date.now()): LiveOrder | null {
  if (!Array.isArray(orders)) return null;
  let newest: Source | null = null;
  for (const order of orders) {
    if (!isSource(order) || !LIVE_STATUSES[order.status]) continue;
    if (now - Date.parse(order.createdAt) > LIVE_ORDER_MAX_AGE_MS) continue;
    if (!newest || Date.parse(order.createdAt) > Date.parse(newest.createdAt)) newest = order;
  }
  if (!newest) return null;
  const live = LIVE_STATUSES[newest.status];
  const currency = newest.currency;
  return {
    orderId: newest.id,
    kitchenName: newest.kitchenName,
    status: live.status,
    title: live.title,
    reference: `Order #${shortOrderNumber(newest.id)}`,
    doneSteps: live.doneSteps,
    paid: formatLiveOrderMoney(newest.grandTotal, currency),
    items: newest.items.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      quantity: item.quantity,
      price: formatLiveOrderMoney(item.lineTotal, currency),
    })),
  };
}
