import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import type {CartLine, CartMoney, CartSnapshot} from '../domain/cartTypes';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function parseUuid(value: unknown): string | null {
  const candidate = boundedString(value, 64);
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
}

function parseCurrency(value: unknown): string | null {
  const candidate = boundedString(value, 3);
  return candidate && CURRENCY_PATTERN.test(candidate) ? candidate : null;
}

function parseDecimal(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    const normalized = String(value);
    return DECIMAL_PATTERN.test(normalized) ? normalized : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return DECIMAL_PATTERN.test(normalized) ? normalized : null;
}

function parseTimestamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

function parseMoney(value: unknown, currency: string): CartMoney | null {
  const amount = parseDecimal(value);
  return amount ? {amount, currency} : null;
}

function parseOptionalImage(value: unknown): string | null {
  const candidate = boundedString(value, 2048);
  return candidate && /^https:\/\//i.test(candidate) ? candidate : null;
}

function parseOptionalPositiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function parseFoodType(value: unknown): CartLine['foodType'] {
  return value === 'VEG' || value === 'NON_VEG' || value === 'EGG' ? value : null;
}

function parseSpiceLevel(value: unknown): CartLine['spiceLevel'] {
  return value === 'MILD' || value === 'MEDIUM' || value === 'SPICY' ? value : null;
}

function parseCartLine(value: unknown, cartCurrency: string): CartLine | null {
  const item = asRecord(value);
  if (!item) return null;

  const lineId = parseUuid(item.id);
  const menuItemId = parseUuid(item.menuItemId);
  const kitchenId = parseUuid(item.kitchenId);
  const itemName = boundedString(item.itemName, 240);
  const kitchenName = boundedString(item.kitchenName, 240);
  const currency = parseCurrency(item.currency);
  const createdAt = parseTimestamp(item.createdAt);
  const updatedAt = parseTimestamp(item.updatedAt);
  const quantity = item.quantity;

  if (
    !lineId || !menuItemId || !kitchenId || !itemName || !kitchenName ||
    currency !== cartCurrency || !createdAt || !updatedAt ||
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 100
  ) return null;

  const unitPrice = parseMoney(item.unitPrice, cartCurrency);
  const lineTotal = parseMoney(item.lineTotal, cartCurrency);
  if (!unitPrice || !lineTotal) return null;

  return {
    lineId,
    menuItemId,
    kitchenId,
    itemName,
    kitchenName,
    unitPrice,
    quantity,
    lineTotal,
    imageUrl: parseOptionalImage(item.imageUrl),
    foodType: parseFoodType(item.foodType),
    servesCount: parseOptionalPositiveInt(item.servesCount),
    spiceLevel: parseSpiceLevel(item.spiceLevel),
    createdAt,
    updatedAt,
  };
}

export function parseCartSnapshot(value: unknown): CartSnapshot | null {
  const cart = asRecord(value);
  if (!cart || !Array.isArray(cart.items)) return null;

  const cartId = parseUuid(cart.id);
  const currency = parseCurrency(cart.currency);
  const totals = asRecord(cart.totals);
  if (!cartId || !currency || !totals || parseCurrency(totals.currency) !== currency) return null;

  const foodSubtotal = parseMoney(totals.foodSubtotal, currency);
  if (!foodSubtotal) return null;

  const lines: CartLine[] = [];
  for (const item of cart.items) {
    const line = parseCartLine(item, currency);
    if (!line) return null;
    lines.push(line);
  }

  return {cartId, currency, lines, totals: {foodSubtotal}};
}

function requireUuid(value: string, code: string, message: string): void {
  if (!UUID_PATTERN.test(value)) throw new AppApiError(code, message);
}

function requireQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new AppApiError(
      'CART_INVALID_QUANTITY',
      'Choose a quantity between 1 and 100.',
    );
  }
}

function requireCartSnapshot(value: unknown): CartSnapshot {
  const snapshot = parseCartSnapshot(value);
  if (!snapshot) {
    throw new AppApiError('CART_INVALID_RESPONSE', 'Cart information could not be verified. Please try again.');
  }
  return snapshot;
}

export interface CartSnapshotRequestPayload {
  cartId: string;
  items: Array<{id: string; quantity: number; updatedAt: string}>;
}

export function buildCartSnapshotRequest(snapshot: CartSnapshot): CartSnapshotRequestPayload {
  requireUuid(snapshot.cartId, 'CART_INVALID_ID', 'This cart could not be verified.');
  if (snapshot.lines.length > 200) {
    throw new AppApiError('CART_TOO_LARGE', 'This cart is too large to verify safely.');
  }
  return {
    cartId: snapshot.cartId,
    items: snapshot.lines.map(line => {
      requireUuid(line.lineId, 'CART_INVALID_LINE_ID', 'A cart item could not be verified.');
      requireQuantity(line.quantity);
      if (!parseTimestamp(line.updatedAt)) {
        throw new AppApiError('CART_INVALID_TIMESTAMP', 'A cart item could not be verified. Refresh the cart and try again.');
      }
      return {id: line.lineId, quantity: line.quantity, updatedAt: line.updatedAt};
    }),
  };
}

export interface SwitchKitchenRequestPayload {
  expectedCart: CartSnapshotRequestPayload;
  menuItemId: string;
  expectedKitchenId: string;
  quantity: number;
}

export interface ReorderCartRequestPayload {
  expectedCart: CartSnapshotRequestPayload;
  expectedKitchenId: string;
}

export function buildSwitchKitchenRequest(
  expectedCart: CartSnapshot,
  menuItemId: string,
  quantity: number,
  expectedKitchenId: string,
): SwitchKitchenRequestPayload {
  requireUuid(
    menuItemId,
    'CART_INVALID_MENU_ITEM_ID',
    'This dish could not be added to the cart.',
  );
  requireUuid(
    expectedKitchenId,
    'CART_INVALID_KITCHEN_ID',
    'This kitchen could not be verified.',
  );
  requireQuantity(quantity);
  return {
    expectedCart: buildCartSnapshotRequest(expectedCart),
    menuItemId,
    expectedKitchenId,
    quantity,
  };
}

export function buildReorderCartRequest(
  expectedCart: CartSnapshot,
  expectedKitchenId: string,
): ReorderCartRequestPayload {
  requireUuid(
    expectedKitchenId,
    'CART_INVALID_KITCHEN_ID',
    'This kitchen could not be verified.',
  );
  return {
    expectedCart: buildCartSnapshotRequest(expectedCart),
    expectedKitchenId,
  };
}

export const cartApi = {
  async getSnapshot(): Promise<CartSnapshot> {
    const response = await httpClient.get<unknown>('/api/v1/cart', {dedupeKey: 'customer-cart:snapshot'});
    return requireCartSnapshot(response);
  },
  async addItem(menuItemId: string, quantity: number): Promise<CartSnapshot> {
    requireUuid(menuItemId, 'CART_INVALID_MENU_ITEM_ID', 'This dish could not be added to the cart.');
    requireQuantity(quantity);
    return requireCartSnapshot(await httpClient.post<unknown>('/api/v1/cart/items', {menuItemId, quantity}));
  },
  async updateItem(cartItemId: string, quantity: number): Promise<CartSnapshot> {
    requireUuid(cartItemId, 'CART_INVALID_LINE_ID', 'This cart item could not be updated.');
    requireQuantity(quantity);
    return requireCartSnapshot(await httpClient.put<unknown>(`/api/v1/cart/items/${cartItemId}`, {quantity}));
  },
  async removeItem(cartItemId: string): Promise<CartSnapshot> {
    requireUuid(cartItemId, 'CART_INVALID_LINE_ID', 'This cart item could not be removed.');
    return requireCartSnapshot(await httpClient.delete<unknown>(`/api/v1/cart/items/${cartItemId}`));
  },
  async validate(): Promise<CartSnapshot> {
    return requireCartSnapshot(await httpClient.post<unknown>('/api/v1/cart/validate'));
  },
  async clearIfUnchanged(expectedCart: CartSnapshot): Promise<CartSnapshot> {
    return requireCartSnapshot(
      await httpClient.post<unknown>('/api/v1/cart/clear-if-unchanged', buildCartSnapshotRequest(expectedCart)),
    );
  },
  async switchKitchen(
    expectedCart: CartSnapshot,
    menuItemId: string,
    quantity: number,
    expectedKitchenId: string,
  ): Promise<CartSnapshot> {
    return requireCartSnapshot(
      await httpClient.post<unknown>(
        '/api/v1/cart/switch-kitchen',
        buildSwitchKitchenRequest(
          expectedCart,
          menuItemId,
          quantity,
          expectedKitchenId,
        ),
      ),
    );
  },
  async reorderIfUnchanged(
    orderId: string,
    expectedCart: CartSnapshot,
    expectedKitchenId: string,
  ): Promise<CartSnapshot> {
    requireUuid(
      orderId,
      'CART_INVALID_ORDER_ID',
      'This order could not be reordered.',
    );
    return requireCartSnapshot(
      await httpClient.post<unknown>(
        `/api/v1/cart/reorder-if-unchanged/${encodeURIComponent(orderId)}`,
        buildReorderCartRequest(expectedCart, expectedKitchenId),
      ),
    );
  },
  async reorder(orderId: string): Promise<CartSnapshot> {
    requireUuid(orderId, 'CART_INVALID_ORDER_ID', 'This order could not be reordered.');
    return requireCartSnapshot(
      await httpClient.post<unknown>(`/api/v1/cart/reorder/${encodeURIComponent(orderId)}`),
    );
  },
};