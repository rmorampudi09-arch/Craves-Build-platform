import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import type {
  CheckoutCreateRequest,
  CheckoutMoney,
  CheckoutOrderReference,
  CheckoutOrderStatus,
  CheckoutSession,
  CheckoutStatus,
} from '../domain/checkoutTypes';

const RESOURCE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// PostgreSQL accepts the full UUID text shape. Craves intentionally seeds
// backend-owned policy identifiers such as 20000000-0000-0000-0000-000000000001,
// whose version/variant nibbles are not RFC-generated resource UUIDs.
const POSTGRES_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const CHECKOUT_STATUSES = new Set<CheckoutStatus>([
  'PAYMENT_PENDING',
  'PAID',
  'CANCELLED',
]);
const ORDER_STATUSES = new Set<CheckoutOrderStatus>([
  'PAYMENT_PENDING',
  'PAID',
  'CHEF_ACCEPTANCE_PENDING',
  'CHEF_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CHEF_REJECTED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'REFUND_FAILED',
]);

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

function parseResourceUuid(value: unknown): string | null {
  const candidate = boundedString(value, 64);
  return candidate && RESOURCE_UUID_PATTERN.test(candidate) ? candidate : null;
}

function parsePostgresUuid(value: unknown): string | null {
  const candidate = boundedString(value, 64);
  return candidate && POSTGRES_UUID_PATTERN.test(candidate) ? candidate : null;
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

function parseMoney(value: unknown, currency: string): CheckoutMoney | null {
  const amount = parseDecimal(value);
  return amount ? {amount, currency} : null;
}

function parseTimestamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

function parseCheckoutStatus(value: unknown): CheckoutStatus | null {
  return typeof value === 'string' && CHECKOUT_STATUSES.has(value as CheckoutStatus)
    ? (value as CheckoutStatus)
    : null;
}

function parseOrderStatus(value: unknown): CheckoutOrderStatus | null {
  return typeof value === 'string' && ORDER_STATUSES.has(value as CheckoutOrderStatus)
    ? (value as CheckoutOrderStatus)
    : null;
}

function parseOrderReference(
  value: unknown,
  expectedCheckoutId: string,
): CheckoutOrderReference | null {
  const order = asRecord(value);
  if (!order) {
    return null;
  }

  const orderId = parseResourceUuid(order.id);
  const checkoutId = parseResourceUuid(order.checkoutId);
  const status = parseOrderStatus(order.status);
  if (!orderId || checkoutId !== expectedCheckoutId || !status) {
    return null;
  }

  return {orderId, checkoutId, status};
}

export function parseCheckoutSession(value: unknown): CheckoutSession | null {
  const checkout = asRecord(value);
  if (!checkout || !Array.isArray(checkout.orders)) {
    return null;
  }

  const checkoutId = parseResourceUuid(checkout.id);
  const customerIdentityId = parseResourceUuid(checkout.customerIdentityId);
  const status = parseCheckoutStatus(checkout.status);
  const currency = parseCurrency(checkout.currency);
  const chargePolicyId = parsePostgresUuid(checkout.chargePolicyId);
  const deliveryAddressId = parseResourceUuid(checkout.deliveryAddressId);
  const createdAt = parseTimestamp(checkout.createdAt);

  if (
    !checkoutId ||
    !customerIdentityId ||
    !status ||
    !currency ||
    !chargePolicyId ||
    !deliveryAddressId ||
    !createdAt
  ) {
    return null;
  }

  const foodSubtotal = parseMoney(checkout.foodSubtotal, currency);
  const platformFee = parseMoney(checkout.platformFee, currency);
  const taxAmount = parseMoney(checkout.taxAmount, currency);
  const deliveryFee = parseMoney(checkout.deliveryFee, currency);
  const grandTotal = parseMoney(checkout.grandTotal, currency);
  if (!foodSubtotal || !platformFee || !taxAmount || !deliveryFee || !grandTotal) {
    return null;
  }

  const orders: CheckoutOrderReference[] = [];
  for (const valueOfOrder of checkout.orders) {
    const order = parseOrderReference(valueOfOrder, checkoutId);
    if (!order) {
      return null;
    }
    orders.push(order);
  }

  return {
    checkoutId,
    customerIdentityId,
    status,
    currency,
    foodSubtotal,
    platformFee,
    taxAmount,
    deliveryFee,
    grandTotal,
    chargePolicyId,
    deliveryAddressId,
    orders,
    createdAt,
  };
}

function requireUuid(value: string, code: string, message: string): void {
  if (!RESOURCE_UUID_PATTERN.test(value)) {
    throw new AppApiError(code, message);
  }
}

function requireCheckoutSession(value: unknown): CheckoutSession {
  const session = parseCheckoutSession(value);
  if (!session) {
    throw new AppApiError(
      'CHECKOUT_INVALID_RESPONSE',
      'Checkout information could not be verified. Please refresh before trying again.',
    );
  }
  return session;
}

function requireNote(note: string | null | undefined): void {
  if (note !== undefined && note !== null && typeof note !== 'string') {
    throw new AppApiError(
      'CHECKOUT_INVALID_NOTE',
      'The delivery note could not be accepted.',
    );
  }
}

export const checkoutApi = {
  async createSession(request: CheckoutCreateRequest): Promise<CheckoutSession> {
    requireUuid(
      request.deliveryAddressId,
      'CHECKOUT_INVALID_ADDRESS_ID',
      'Choose a valid delivery address before checkout.',
    );
    requireNote(request.note);

    const body =
      request.note === undefined
        ? {deliveryAddressId: request.deliveryAddressId}
        : {deliveryAddressId: request.deliveryAddressId, note: request.note};
    const response = await httpClient.post<unknown>('/api/v1/checkout', body);
    const session = requireCheckoutSession(response);
    if (session.deliveryAddressId !== request.deliveryAddressId) {
      throw new AppApiError(
        'CHECKOUT_ADDRESS_MISMATCH',
        'Checkout returned a different delivery address. Please refresh before trying again.',
      );
    }
    return session;
  },

  async getSession(checkoutId: string): Promise<CheckoutSession> {
    requireUuid(
      checkoutId,
      'CHECKOUT_INVALID_ID',
      'This checkout could not be opened.',
    );
    const response = await httpClient.get<unknown>(`/api/v1/checkout/${checkoutId}`, {
      dedupeKey: `customer-checkout:${checkoutId}`,
    });
    const session = requireCheckoutSession(response);
    if (session.checkoutId !== checkoutId) {
      throw new AppApiError(
        'CHECKOUT_ID_MISMATCH',
        'Checkout information could not be verified. Please refresh and try again.',
      );
    }
    return session;
  },
};
