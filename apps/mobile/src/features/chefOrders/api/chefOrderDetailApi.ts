import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_JAVA_INTEGER = 2_147_483_647;

export type ChefOrderDetailStatus =
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'CHEF_ACCEPTANCE_PENDING'
  | 'CHEF_ACCEPTED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CHEF_REJECTED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'REFUND_FAILED';

export interface ChefOrderDetailItem {
  id: string;
  menuItemId: string;
  itemName: string;
  category: string | null;
  foodType: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface ChefOrderDeliveryAddress {
  sourceAddressId: string;
  recipientName: string;
  contactPhoneNumber: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  areaName: string | null;
  city: string;
  state: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

export interface ChefOrderDetail {
  id: string;
  checkoutId: string;
  kitchenId: string;
  kitchenName: string | null;
  status: ChefOrderDetailStatus;
  currency: string;
  foodSubtotal: number;
  platformFee: number;
  taxAmount: number;
  deliveryFee: number;
  grandTotal: number;
  chefResponseNote: string | null;
  prepTimeMinutes: number | null;
  deliveryAddress: ChefOrderDeliveryAddress | null;
  items: ChefOrderDetailItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ChefAcceptOrderRequest {
  prepTimeMinutes: number;
  note: string | null;
}

export interface ChefRejectOrderRequest {
  reason: string | null;
}

const ORDER_STATUSES = new Set<ChefOrderDetailStatus>([
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

function optionalString(value: unknown, maxLength: number): string | null {
  return value == null || value === '' ? null : boundedString(value, maxLength);
}

function timestamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function money(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000
    ? parsed
    : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_JAVA_INTEGER
    ? parsed
    : null;
}

function optionalPositiveInteger(value: unknown): number | null {
  return value == null ? null : positiveInteger(value);
}

function coordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

export function isChefOrderId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function parseOrderItem(value: unknown): ChefOrderDetailItem | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }
  const id = boundedString(raw.id, 64);
  const menuItemId = boundedString(raw.menuItemId, 64);
  const itemName = boundedString(raw.itemName, 180);
  const unitPrice = money(raw.unitPrice);
  const quantity = positiveInteger(raw.quantity);
  const lineTotal = money(raw.lineTotal);

  if (
    !isChefOrderId(id) ||
    !isChefOrderId(menuItemId) ||
    !itemName ||
    unitPrice === null ||
    quantity === null ||
    lineTotal === null
  ) {
    return null;
  }

  return {
    id,
    menuItemId,
    itemName,
    category: optionalString(raw.category, 80),
    foodType: optionalString(raw.foodType, 40),
    unitPrice,
    quantity,
    lineTotal,
  };
}

function parseDeliveryAddress(value: unknown): ChefOrderDeliveryAddress | null {
  if (value == null) {
    return null;
  }
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  const sourceAddressId = boundedString(raw.sourceAddressId, 64);
  const recipientName = boundedString(raw.recipientName, 160);
  const contactPhoneNumber = boundedString(raw.contactPhoneNumber, 24);
  const addressLine1 = boundedString(raw.addressLine1, 250);
  const city = boundedString(raw.city, 120);
  const state = boundedString(raw.state, 120);
  const postalCode = boundedString(raw.postalCode, 20);
  const latitude = coordinate(raw.latitude, -90, 90);
  const longitude = coordinate(raw.longitude, -180, 180);

  if (
    !isChefOrderId(sourceAddressId) ||
    !recipientName ||
    !contactPhoneNumber ||
    !addressLine1 ||
    !city ||
    !state ||
    !postalCode ||
    latitude === null ||
    longitude === null
  ) {
    return null;
  }

  return {
    sourceAddressId,
    recipientName,
    contactPhoneNumber,
    addressLine1,
    addressLine2: optionalString(raw.addressLine2, 250),
    landmark: optionalString(raw.landmark, 160),
    areaName: optionalString(raw.areaName, 120),
    city,
    state,
    postalCode,
    latitude,
    longitude,
  };
}

export function parseChefOrderDetail(value: unknown): ChefOrderDetail | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  const id = boundedString(raw.id, 64);
  const checkoutId = boundedString(raw.checkoutId, 64);
  const kitchenId = boundedString(raw.kitchenId, 64);
  const status = boundedString(raw.status, 40) as ChefOrderDetailStatus | null;
  const currency = boundedString(raw.currency, 3);
  const foodSubtotal = money(raw.foodSubtotal);
  const platformFee = money(raw.platformFee);
  const taxAmount = money(raw.taxAmount);
  const deliveryFee = money(raw.deliveryFee);
  const grandTotal = money(raw.grandTotal);
  const createdAt = timestamp(raw.createdAt);
  const updatedAt = timestamp(raw.updatedAt) ?? createdAt;
  const prepTimeMinutes = optionalPositiveInteger(raw.prepTimeMinutes);
  const rawItems = Array.isArray(raw.items) ? raw.items.slice(0, 100) : null;
  const items = rawItems?.map(parseOrderItem) ?? null;
  const deliveryAddress = parseDeliveryAddress(raw.deliveryAddress);

  if (
    !isChefOrderId(id) ||
    !isChefOrderId(checkoutId) ||
    !isChefOrderId(kitchenId) ||
    !status ||
    !ORDER_STATUSES.has(status) ||
    !currency ||
    foodSubtotal === null ||
    platformFee === null ||
    taxAmount === null ||
    deliveryFee === null ||
    grandTotal === null ||
    !createdAt ||
    !updatedAt ||
    !items ||
    items.some(item => item === null) ||
    (raw.deliveryAddress != null && deliveryAddress === null) ||
    (raw.prepTimeMinutes != null && prepTimeMinutes === null)
  ) {
    return null;
  }

  return {
    id,
    checkoutId,
    kitchenId,
    kitchenName: optionalString(raw.kitchenName, 180),
    status,
    currency: currency.toUpperCase(),
    foodSubtotal,
    platformFee,
    taxAmount,
    deliveryFee,
    grandTotal,
    chefResponseNote: optionalString(raw.chefResponseNote, 500),
    prepTimeMinutes,
    deliveryAddress,
    items: items as ChefOrderDetailItem[],
    createdAt,
    updatedAt,
  };
}

function requireChefOrderId(orderId: string): string {
  if (!isChefOrderId(orderId)) {
    throw new Error('Chef order ID must be a UUID.');
  }
  return orderId;
}

function actionHeaders(idempotencyKey?: string): Record<string, string> | undefined {
  if (idempotencyKey === undefined) {
    return undefined;
  }
  if (!idempotencyKey.trim()) {
    throw new Error('Idempotency key must not be blank.');
  }
  return {'Idempotency-Key': idempotencyKey};
}

function requireOrderResponse(value: unknown): ChefOrderDetail {
  const parsed = parseChefOrderDetail(value);
  if (!parsed) {
    throw new Error('Chef order detail returned an unsupported response.');
  }
  return parsed;
}

export const chefOrderDetailApi = {
  async getOrder(
    orderId: string,
    signal?: AbortSignal,
  ): Promise<ChefOrderDetail> {
    const id = requireChefOrderId(orderId);
    const response = await httpClient.get<unknown>(
      `/api/v1/chef/orders/${encodeURIComponent(id)}`,
      {
        signal,
        dedupeKey: `chef-order-detail:${id}`,
      },
    );
    return requireOrderResponse(response);
  },

  async acceptOrder(
    orderId: string,
    request: ChefAcceptOrderRequest,
    idempotencyKey?: string,
    signal?: AbortSignal,
  ): Promise<ChefOrderDetail> {
    const id = requireChefOrderId(orderId);
    if (positiveInteger(request.prepTimeMinutes) === null) {
      throw new Error('Preparation time must be a positive integer.');
    }
    const response = await httpClient.post<unknown>(
      `/api/v1/chef/orders/${encodeURIComponent(id)}/accept`,
      request,
      {signal, headers: actionHeaders(idempotencyKey)},
    );
    return requireOrderResponse(response);
  },

  async rejectOrder(
    orderId: string,
    request: ChefRejectOrderRequest,
    idempotencyKey?: string,
    signal?: AbortSignal,
  ): Promise<ChefOrderDetail> {
    const id = requireChefOrderId(orderId);
    const response = await httpClient.post<unknown>(
      `/api/v1/chef/orders/${encodeURIComponent(id)}/reject`,
      request,
      {signal, headers: actionHeaders(idempotencyKey)},
    );
    return requireOrderResponse(response);
  },

  async markReadyForPickup(
    orderId: string,
    signal?: AbortSignal,
  ): Promise<ChefOrderDetail> {
    const id = requireChefOrderId(orderId);
    const response = await httpClient.post<unknown>(
      `/api/v1/chef/orders/${encodeURIComponent(id)}/ready-for-pickup`,
      undefined,
      {signal},
    );
    return requireOrderResponse(response);
  },
};
