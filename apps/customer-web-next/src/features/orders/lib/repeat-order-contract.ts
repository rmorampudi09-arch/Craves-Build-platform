// Mirrors order-service RepeatOrderDtos (GET /api/v1/orders/repeat-candidates) and ApiDtos.ReorderCartRequest
// (POST /api/v1/cart/reorder-if-unchanged/{orderId}); rules and copy from the app's repeatOrdersApi.ts and
// repeatOrderPresentation.ts. Browser-safe.
export const REPEAT_ORDER_PAGE_SIZE = 20;
export const REPEAT_ORDER_MAX_PAGE_SIZE = 50;

export type RepeatOrderItem = { menuItemId: string; itemName: string; quantity: number };
export type RepeatOrderCandidate = {
  orderId: string;
  kitchenId: string;
  kitchenName: string;
  lastOrderedAt: string;
  completedOrdersFromKitchen: number;
  items: RepeatOrderItem[];
  previousOrderTotal: string;
  previousOrderCurrency: string;
  preferenceRecallSupported: boolean;
  currentValidationNotice: string;
};
export type RepeatOrderPage = {
  items: RepeatOrderCandidate[];
  nextCursor: string | null;
  hasMore: boolean;
};
export type ReorderCartRequest = {
  expectedCart: { cartId: string; items: { id: string; quantity: number; updatedAt: string }[] };
  expectedKitchenId: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const uuid = (value: unknown): string | null =>
  typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
const int = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}
const instant = (value: unknown): string | null =>
  typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value))
    ? value
    : null;

function parseItem(value: unknown): RepeatOrderItem | null {
  const raw = record(value);
  const menuItemId = uuid(raw?.menuItemId);
  const itemName = text(raw?.itemName, 240);
  const quantity = int(raw?.quantity, 1, 100);
  return menuItemId && itemName && quantity !== null ? { menuItemId, itemName, quantity } : null;
}

function parseCandidate(value: unknown): RepeatOrderCandidate | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 100)
    return null;
  const orderId = uuid(raw.orderId);
  const kitchenId = uuid(raw.kitchenId);
  const kitchenName = text(raw.kitchenName, 240);
  const lastOrderedAt = instant(raw.lastOrderedAt);
  const completedOrdersFromKitchen = int(raw.completedOrdersFromKitchen, 1, 1_000_000);
  const items = raw.items.map(parseItem);
  const total = raw.previousOrderTotal;
  const previousOrderTotal =
    typeof total === "number" && Number.isFinite(total) && total >= 0
      ? String(total)
      : typeof total === "string" && /^\d{1,12}(?:\.\d{1,4})?$/.test(total)
        ? total
        : null;
  const previousOrderCurrency =
    typeof raw.previousOrderCurrency === "string" && /^[A-Z]{3}$/.test(raw.previousOrderCurrency)
      ? raw.previousOrderCurrency
      : null;
  const currentValidationNotice = text(raw.currentValidationNotice, 500);
  if (
    !orderId ||
    !kitchenId ||
    !kitchenName ||
    !lastOrderedAt ||
    completedOrdersFromKitchen === null ||
    items.some((item) => !item) ||
    !previousOrderTotal ||
    !previousOrderCurrency ||
    !currentValidationNotice ||
    raw.orderLikeLastTimeAvailable !== true ||
    typeof raw.preferenceRecallSupported !== "boolean" ||
    int(raw.rememberedPreferenceCount, 0, 1_000_000) === null
  )
    return null;
  return {
    orderId,
    kitchenId,
    kitchenName,
    lastOrderedAt,
    completedOrdersFromKitchen,
    items: items as RepeatOrderItem[],
    previousOrderTotal,
    previousOrderCurrency,
    preferenceRecallSupported: raw.preferenceRecallSupported,
    currentValidationNotice,
  };
}

export function parseRepeatOrderPage(value: unknown): RepeatOrderPage | null {
  const raw = record(value);
  if (
    !raw ||
    !Array.isArray(raw.items) ||
    raw.items.length > REPEAT_ORDER_MAX_PAGE_SIZE ||
    typeof raw.hasMore !== "boolean"
  )
    return null;
  const nextCursor =
    raw.nextCursor === null
      ? null
      : typeof raw.nextCursor === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(raw.nextCursor)
        ? raw.nextCursor
        : undefined;
  // A page that says there is more must say where it continues, and only then.
  if (nextCursor === undefined || raw.hasMore !== (nextCursor !== null)) return null;
  const items = raw.items.map(parseCandidate);
  return items.every(Boolean)
    ? { items: items as RepeatOrderCandidate[], nextCursor, hasMore: raw.hasMore }
    : null;
}

type ExpectedCart = ReorderCartRequest["expectedCart"];

/** The cart's lines as the conditional reorder compares them: id, quantity and updatedAt, each line once. */
function parseExpectedLines(value: unknown): ExpectedCart["items"] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const items = value.map((entry) => {
    const line = record(entry);
    const id = uuid(line?.id);
    const quantity = int(line?.quantity, 1, 100);
    const updatedAt = instant(line?.updatedAt);
    return id && quantity !== null && updatedAt ? { id, quantity, updatedAt } : null;
  });
  return items.some((item) => !item) || new Set(items.map((item) => item!.id)).size !== items.length
    ? null
    : (items as ExpectedCart["items"]);
}

/** The body of a conditional reorder: the cart the customer last saw (each line's id, quantity and updatedAt) and the order's kitchen. */
export function parseReorderCartRequest(value: unknown): ReorderCartRequest | null {
  const raw = record(value);
  const cart = record(raw?.expectedCart);
  const cartId = uuid(cart?.cartId);
  const expectedKitchenId = uuid(raw?.expectedKitchenId);
  const items = parseExpectedLines(cart?.items);
  return cartId && expectedKitchenId && items
    ? { expectedCart: { cartId, items }, expectedKitchenId }
    : null;
}

/** The cart from GET /api/cart as the conditional reorder expects it to still be. */
export function parseCartForReorder(value: unknown): ExpectedCart | null {
  const raw = record(value);
  const cartId = uuid(raw?.id);
  const items = parseExpectedLines(raw?.items);
  return cartId && items ? { cartId, items } : null;
}

/**
 * Favourite kitchens first, then the most-ordered kitchens, then the newest order. The app also orders favourites
 * by whether they cook today; the web has no cooking state, so they share one rank.
 */
export function rankRepeatOrderCandidates(
  candidates: readonly RepeatOrderCandidate[],
  favoriteKitchenIds: ReadonlySet<string>,
): RepeatOrderCandidate[] {
  return [...candidates].sort(
    (left, right) =>
      Number(favoriteKitchenIds.has(right.kitchenId)) -
        Number(favoriteKitchenIds.has(left.kitchenId)) ||
      right.completedOrdersFromKitchen - left.completedOrdersFromKitchen ||
      Date.parse(right.lastOrderedAt) - Date.parse(left.lastOrderedAt) ||
      left.orderId.localeCompare(right.orderId),
  );
}

export function repeatOrderBasketSummary(candidate: RepeatOrderCandidate): string {
  const visible = candidate.items
    .slice(0, 2)
    .map((item) => (item.quantity > 1 ? `${item.quantity}× ${item.itemName}` : item.itemName));
  const remaining = candidate.items.length - visible.length;
  return remaining > 0 ? `${visible.join(", ")} +${remaining} more` : visible.join(", ");
}

export function previousOrderTotalLabel(candidate: RepeatOrderCandidate): string {
  const amount = Number(candidate.previousOrderTotal);
  const value = Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)
    : candidate.previousOrderTotal;
  return candidate.previousOrderCurrency === "INR"
    ? `Previous total ₹${value}`
    : `Previous total ${candidate.previousOrderCurrency} ${value}`;
}

export function familiarityLabel(candidate: RepeatOrderCandidate): string {
  return candidate.completedOrdersFromKitchen === 1
    ? "Ordered from this kitchen once"
    : `Ordered from this kitchen ${candidate.completedOrdersFromKitchen} times`;
}
