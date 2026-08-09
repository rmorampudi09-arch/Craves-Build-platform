import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_JAVA_INTEGER = 2_147_483_647;

export type ChefOperationalOrderStatus =
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

const ORDER_STATUSES = new Set<ChefOperationalOrderStatus>([
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

export interface ChefOperationalOrderItemSummary {
  id: string;
  itemName: string;
  quantity: number;
}

export interface ChefOperationalDeliverySummary {
  areaName: string | null;
  city: string;
}

export interface ChefOperationalOrder {
  id: string;
  status: ChefOperationalOrderStatus;
  kitchenName?: string | null;
  items?: ChefOperationalOrderItemSummary[];
  deliverySummary?: ChefOperationalDeliverySummary | null;
  prepTimeMinutes?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ChefOperationalNotice {
  id: string;
  title: string;
  body: string;
  noticeType: string | null;
  targetType: string | null;
  targetId: string | null;
  readAt: string | null;
  createdAt: string;
}

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

function validTimestamp(value: unknown, nullable = false): string | null {
  if (nullable && value == null) {
    return null;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return value;
}

function optionalPositiveInteger(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_JAVA_INTEGER
    ? parsed
    : null;
}

function parseOrderItemSummary(
  value: unknown,
): ChefOperationalOrderItemSummary | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }
  const id = boundedString(raw.id, 64);
  const itemName = boundedString(raw.itemName, 180);
  const quantity = optionalPositiveInteger(raw.quantity);
  if (!id || !UUID_PATTERN.test(id) || !itemName || quantity === null) {
    return null;
  }
  return {id, itemName, quantity};
}

function parseOrderItemSummaries(
  value: unknown,
): ChefOperationalOrderItemSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, 100)
    .map(parseOrderItemSummary)
    .filter((item): item is ChefOperationalOrderItemSummary => item !== null);
}

function parseDeliverySummary(
  value: unknown,
): ChefOperationalDeliverySummary | null {
  if (value == null) {
    return null;
  }
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }
  const city = boundedString(raw.city, 120);
  if (!city) {
    return null;
  }
  return {
    areaName: optionalString(raw.areaName, 120),
    city,
  };
}

function parseOrder(value: unknown): ChefOperationalOrder | null {
  const order = asRecord(value);
  if (!order) {
    return null;
  }
  const id = boundedString(order.id, 64);
  const status = boundedString(order.status, 40) as ChefOperationalOrderStatus | null;
  const prepTimeMinutes = optionalPositiveInteger(order.prepTimeMinutes);
  const createdAt = validTimestamp(order.createdAt, true);
  const updatedAt = validTimestamp(order.updatedAt, true);
  const items = parseOrderItemSummaries(order.items);
  const deliverySummary = parseDeliverySummary(order.deliveryAddress);
  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    !status ||
    !ORDER_STATUSES.has(status) ||
    (order.prepTimeMinutes != null && prepTimeMinutes === null) ||
    (order.createdAt != null && createdAt === null) ||
    (order.updatedAt != null && updatedAt === null)
  ) {
    return null;
  }
  return {
    id,
    status,
    kitchenName: optionalString(order.kitchenName, 180),
    items,
    deliverySummary,
    prepTimeMinutes,
    createdAt,
    updatedAt,
  };
}

function orderArrayFromResponse(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  const wrapper = asRecord(value);
  if (!wrapper) {
    return null;
  }
  for (const key of ['orders', 'content', 'data'] as const) {
    if (Array.isArray(wrapper[key])) {
      return wrapper[key];
    }
  }
  const data = asRecord(wrapper.data);
  if (data) {
    for (const key of ['orders', 'content'] as const) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }
  }
  return null;
}

export function parseChefOperationalOrders(
  value: unknown,
): ChefOperationalOrder[] | null {
  const rawOrders = orderArrayFromResponse(value);
  if (!rawOrders || rawOrders.length > 500) {
    return null;
  }
  const orders = rawOrders.map(parseOrder);
  return orders.some(order => order === null)
    ? null
    : (orders as ChefOperationalOrder[]);
}

function parseNotice(value: unknown): ChefOperationalNotice | null {
  const notice = asRecord(value);
  if (!notice) {
    return null;
  }
  const id = boundedString(notice.id, 64);
  const title = boundedString(notice.title, 200);
  const body = boundedString(notice.body, 2000);
  const createdAt = validTimestamp(notice.createdAt);
  if (!id || !UUID_PATTERN.test(id) || !title || !body || !createdAt) {
    return null;
  }

  const targetId = boundedString(notice.targetId, 64);
  if (targetId && !UUID_PATTERN.test(targetId)) {
    return null;
  }
  const readAt = validTimestamp(notice.readAt, true);
  if (notice.readAt != null && !readAt) {
    return null;
  }

  return {
    id,
    title,
    body,
    noticeType: boundedString(notice.noticeType, 80),
    targetType: boundedString(notice.targetType, 80),
    targetId,
    readAt,
    createdAt,
  };
}

export function parseChefOperationalNotices(
  value: unknown,
): ChefOperationalNotice[] | null {
  if (!Array.isArray(value) || value.length > 100) {
    return null;
  }
  const notices = value.map(parseNotice);
  return notices.some(notice => notice === null)
    ? null
    : (notices as ChefOperationalNotice[]);
}

export const chefOperationalApi = {
  async listOrders(signal?: AbortSignal): Promise<ChefOperationalOrder[]> {
    const response = await httpClient.get<unknown>('/api/v1/chef/orders', {
      signal,
      dedupeKey: 'chef-shell:orders',
    });
    const parsed = parseChefOperationalOrders(response);
    if (!parsed) {
      throw new Error('Chef orders returned an unsupported response.');
    }
    return parsed;
  },

  async listNotifications(
    signal?: AbortSignal,
  ): Promise<ChefOperationalNotice[]> {
    const response = await httpClient.get<unknown>('/api/v1/notifications/in-app', {
      params: {limit: 100},
      signal,
      dedupeKey: 'chef-shell:notifications:100',
    });
    const parsed = parseChefOperationalNotices(response);
    if (!parsed) {
      throw new Error('Chef notifications returned an unsupported response.');
    }
    return parsed;
  },

  async markNotificationRead(
    noticeId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!UUID_PATTERN.test(noticeId)) {
      throw new Error('Notification ID must be a UUID.');
    }
    await httpClient.patch<void>(
      `/api/v1/notifications/in-app/${encodeURIComponent(noticeId)}/read`,
      undefined,
      {signal},
    );
  },
};
