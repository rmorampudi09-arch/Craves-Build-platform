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
  if (typeof value !== 'string') {
    return null;
  }

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
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    const normalized = String(value);
    return DECIMAL_PATTERN.test(normalized) ? normalized : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return DECIMAL_PATTERN.test(normalized) ? normalized : null;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return value;
}

function parseMoney(value: unknown, currency: string): CartMoney | null {
  const amount = parseDecimal(value);
  return amount ? {amount, currency} : null;
}

function parseCartLine(value: unknown, cartCurrency: string): CartLine | null {
  const item = asRecord(value);
  if (!item) {
    return null;
  }

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
    !lineId ||
    !menuItemId ||
    !kitchenId ||
    !itemName ||
    !kitchenName ||
    currency !== cartCurrency ||
    !createdAt ||
    !updatedAt ||
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  ) {
    return null;
  }

  const unitPrice = parseMoney(item.unitPrice, cartCurrency);
  const lineTotal = parseMoney(item.lineTotal, cartCurrency);
  if (!unitPrice || !lineTotal) {
    return null;
  }

  return {
    lineId,
    menuItemId,
    kitchenId,
    itemName,
    kitchenName,
    unitPrice,
    quantity,
    lineTotal,
    createdAt,
    updatedAt,
  };
}

export function parseCartSnapshot(value: unknown): CartSnapshot | null {
  const cart = asRecord(value);
  if (!cart || !Array.isArray(cart.items)) {
    return null;
  }

  const cartId = parseUuid(cart.id);
  const currency = parseCurrency(cart.currency);
  const totals = asRecord(cart.totals);
  if (!cartId || !currency || !totals || parseCurrency(totals.currency) !== currency) {
    return null;
  }

  const foodSubtotal = parseMoney(totals.foodSubtotal, currency);
  if (!foodSubtotal) {
    return null;
  }

  const lines: CartLine[] = [];
  for (const item of cart.items) {
    const line = parseCartLine(item, currency);
    if (!line) {
      return null;
    }
    lines.push(line);
  }

  return {
    cartId,
    currency,
    lines,
    totals: {foodSubtotal},
  };
}

export const cartApi = {
  async getSnapshot(): Promise<CartSnapshot> {
    const response = await httpClient.get<unknown>('/api/v1/cart', {
      dedupeKey: 'customer-cart:snapshot',
    });
    const snapshot = parseCartSnapshot(response);
    if (!snapshot) {
      throw new Error('Cart response failed validation.');
    }
    return snapshot;
  },
};
