import {z} from 'zod';
import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {
  CUSTOMER_ORDER_STATUSES,
  CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT,
  type CustomerOrder,
} from '../domain/customerOrderTypes';

export {CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT} from '../domain/customerOrderTypes';

export const CUSTOMER_ORDERS_PATH = '/api/v1/orders';

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

const addressSchema = z.object({
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
  checkoutId: z.string().uuid(),
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

const orderWindowSchema = z.array(orderSchema).max(CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT);

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

export function parseCustomerOrdersResponse(value: unknown): CustomerOrder[] | null {
  const parsed = orderWindowSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const seenIds = new Set<string>();
  let previousCreatedAt = Number.POSITIVE_INFINITY;
  const orders: CustomerOrder[] = [];
  for (const rawOrder of parsed.data) {
    const createdAt = Date.parse(rawOrder.createdAt);
    if (seenIds.has(rawOrder.id) || createdAt > previousCreatedAt) {
      return null;
    }
    seenIds.add(rawOrder.id);
    previousCreatedAt = createdAt;
    orders.push(toCustomerOrder(rawOrder));
  }
  return orders;
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
};
