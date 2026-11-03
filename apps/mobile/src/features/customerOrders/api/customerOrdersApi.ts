import {z} from 'zod';
import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {captureException} from '../../../core/observability/observability';
import {
  CUSTOMER_ORDER_STATUSES,
  CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT,
  type CustomerOrder,
} from '../domain/customerOrderTypes';

export {CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT} from '../domain/customerOrderTypes';

export const CUSTOMER_ORDERS_PATH = '/api/v1/orders';
export const customerOrderDetailPath = (orderId: string) =>
  `${CUSTOMER_ORDERS_PATH}/${orderId}`;

const orderIdSchema = z.string().uuid();

const decimalSchema = z
  .union([
    z.number().finite().nonnegative().max(10_000_000),
    z.string().regex(/^\d+(?:\.\d+)?$/),
  ])
  .transform(value => String(value))
  .refine(value => Number(value) <= 10_000_000);

const timestampSchema = z.string().refine(value => !Number.isNaN(Date.parse(value)));

function nullableTrimmed(maxLength: number) {
  return z
    .string()
    .max(maxLength)
    .nullable()
    .transform(value => {
      const normalized = value?.trim() ?? '';
      return normalized ? normalized : null;
    });
}

/** Missing, unreadable or 0 (a placeholder, never a real Indian address) reads as unknown. */
function coordinateSchema(limit: number) {
  return z
    .union([z.number(), z.string()])
    .nullish()
    .transform(value => {
      const number = value === null || value === undefined || value === '' ? NaN : Number(value);
      return Number.isFinite(number) && number !== 0 && Math.abs(number) <= limit ? number : null;
    });
}

const addressSchema = z.object({
  latitude: coordinateSchema(90),
  longitude: coordinateSchema(180),
  recipientName: z.string().trim().min(1).max(160),
  addressLine1: z.string().trim().min(1).max(250),
  addressLine2: nullableTrimmed(250),
  landmark: nullableTrimmed(160),
  areaName: nullableTrimmed(120),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(20),
});

const itemSchema = z.object({
  id: z.string().uuid(),
  menuItemId: z.string().uuid(),
  itemName: z.string().trim().min(1).max(180),
  category: nullableTrimmed(80),
  foodType: nullableTrimmed(40),
  unitPrice: decimalSchema,
  quantity: z.number().int().min(1).max(100),
  lineTotal: decimalSchema,
});

const orderSchema = z.object({
  id: z.string().uuid(),
  // Meal-plan (subscription) orders have no checkout.
  checkoutId: z.string().uuid().nullable(),
  kitchenId: z.string().uuid(),
  kitchenName: z.string().trim().min(1).max(180),
  status: z.enum(CUSTOMER_ORDER_STATUSES),
  currency: z.string().regex(/^[A-Z]{3}$/),
  foodSubtotal: decimalSchema,
  platformFee: decimalSchema,
  taxAmount: decimalSchema,
  deliveryFee: decimalSchema,
  grandTotal: decimalSchema,
  chefResponseNote: nullableTrimmed(500),
  prepTimeMinutes: z.number().int().min(1).max(1440).nullable(),
  deliveryAddress: addressSchema.nullable(),
  items: z.array(itemSchema).max(100),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const orderWindowSchema = z.array(z.unknown()).max(CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT);

type ParsedOrder = z.infer<typeof orderSchema>;

function toCustomerOrder(order: ParsedOrder): CustomerOrder {
  const currency = order.currency;
  return {
    ...order,
    foodSubtotal: {amount: order.foodSubtotal, currency},
    platformFee: {amount: order.platformFee, currency},
    taxAmount: {amount: order.taxAmount, currency},
    deliveryFee: {amount: order.deliveryFee, currency},
    grandTotal: {amount: order.grandTotal, currency},
    items: order.items.map(item => ({
      ...item,
      unitPrice: {amount: item.unitPrice, currency},
      lineTotal: {amount: item.lineTotal, currency},
    })),
  };
}

export function isCustomerOrderId(value: string): boolean {
  return orderIdSchema.safeParse(value).success;
}

export function parseCustomerOrderResponse(value: unknown): CustomerOrder | null {
  const parsed = orderSchema.safeParse(value);
  return parsed.success ? toCustomerOrder(parsed.data) : null;
}

/** One odd order must not blank the list: a row that fails the schema is dropped and its id reported. */
export function parseCustomerOrderRows(rows: readonly unknown[]): CustomerOrder[] {
  const orders: CustomerOrder[] = [];
  for (const row of rows) {
    const order = parseCustomerOrderResponse(row);
    if (order) {
      orders.push(order);
    } else {
      const id = (row as {id?: unknown} | null)?.id;
      captureException(new Error('Customer order row dropped'), 'customer_order_row_dropped', {
        orderId: typeof id === 'string' ? id : null,
      });
    }
  }
  return orders;
}

export function parseCustomerOrdersResponse(value: unknown): CustomerOrder[] | null {
  const parsed = orderWindowSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const seenIds = new Set<string>();
  let previousCreatedAt = Number.POSITIVE_INFINITY;
  const orders: CustomerOrder[] = [];
  for (const order of parseCustomerOrderRows(parsed.data)) {
    const createdAt = Date.parse(order.createdAt);
    if (seenIds.has(order.id) || createdAt > previousCreatedAt) {
      return null;
    }
    seenIds.add(order.id);
    previousCreatedAt = createdAt;
    orders.push(order);
  }
  return orders;
}

function requireOrderId(orderId: string): void {
  if (!isCustomerOrderId(orderId)) {
    throw new AppApiError(
      'CUSTOMER_ORDER_INVALID_ID',
      'This order link is invalid.',
    );
  }
}

export const customerOrdersApi = {
  async listRecentOrders(signal?: AbortSignal): Promise<CustomerOrder[]> {
    const response = await httpClient.get<unknown>(CUSTOMER_ORDERS_PATH, {
      signal,
      dedupeKey: 'customer-orders:recent',
    });
    const orders = parseCustomerOrdersResponse(response);
    if (!orders) {
      throw new AppApiError(
        'CUSTOMER_ORDERS_INVALID_RESPONSE',
        'Your order history could not be verified. Please refresh and try again.',
      );
    }
    return orders;
  },

  async getOrder(orderId: string, signal?: AbortSignal): Promise<CustomerOrder> {
    requireOrderId(orderId);
    const response = await httpClient.get<unknown>(customerOrderDetailPath(orderId), {
      signal,
      dedupeKey: `customer-order:${orderId}`,
    });
    const order = parseCustomerOrderResponse(response);
    if (!order || order.id !== orderId) {
      throw new AppApiError(
        'CUSTOMER_ORDER_DETAIL_INVALID_RESPONSE',
        'These order details could not be verified. Please refresh and try again.',
      );
    }
    return order;
  },
};
