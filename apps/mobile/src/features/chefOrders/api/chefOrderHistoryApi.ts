import {httpClient} from '../../../core/http/httpClient';
import type {
  ChefOperationalOrder,
  ChefOperationalOrderStatus,
} from '../../chefShell/api/chefOperationalApi';
import {parseChefOrderDetail} from './chefOrderDetailApi';

export const CHEF_ORDER_HISTORY_V2_AVAILABLE = false;
export const CHEF_ORDER_HISTORY_PAGE_SIZE = 20;

export interface ChefOrderHistoryPage {
  orders: ChefOperationalOrder[];
  nextCursor: string | null;
  hasMore: boolean;
}

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
const PAGE_KEYS = new Set(['orders', 'nextCursor', 'hasMore']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function normalizeLimit(limit: number | undefined): number {
  const resolved = limit ?? CHEF_ORDER_HISTORY_PAGE_SIZE;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 100) {
    throw new Error('CHEF_ORDER_HISTORY_LIMIT_INVALID');
  }
  return resolved;
}

function toOperationalOrder(value: unknown): ChefOperationalOrder | null {
  const order = parseChefOrderDetail(value);
  if (!order) return null;

  return {
    id: order.id,
    status: order.status,
    kitchenName: order.kitchenName,
    items: order.items.map(item => ({
      id: item.id,
      itemName: item.itemName,
      quantity: item.quantity,
    })),
    deliverySummary: order.deliveryAddress
      ? {
          areaName: order.deliveryAddress.areaName,
          city: order.deliveryAddress.city,
        }
      : null,
    prepTimeMinutes: order.prepTimeMinutes,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export function parseChefOrderHistoryPage(
  value: unknown,
): ChefOrderHistoryPage | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, PAGE_KEYS) || !Array.isArray(raw.orders)) {
    return null;
  }

  const orders = raw.orders.map(toOperationalOrder);
  const nextCursor =
    raw.nextCursor == null
      ? null
      : typeof raw.nextCursor === 'string' &&
          raw.nextCursor.length > 0 &&
          raw.nextCursor.length <= 512
        ? raw.nextCursor
        : undefined;

  if (
    orders.some(order => order === null) ||
    nextCursor === undefined ||
    typeof raw.hasMore !== 'boolean' ||
    (raw.hasMore && nextCursor === null)
  ) {
    return null;
  }

  const parsedOrders = orders as ChefOperationalOrder[];
  const seen = new Set<string>();
  let previousCreatedAt = Number.POSITIVE_INFINITY;
  let previousId = '';

  for (const order of parsedOrders) {
    if (!order.createdAt) return null;
    const createdAt = Date.parse(order.createdAt);
    if (
      seen.has(order.id) ||
      createdAt > previousCreatedAt ||
      (createdAt === previousCreatedAt &&
        previousId !== '' &&
        order.id >= previousId)
    ) {
      return null;
    }
    seen.add(order.id);
    previousCreatedAt = createdAt;
    previousId = order.id;
  }

  return {
    orders: parsedOrders,
    nextCursor,
    hasMore: raw.hasMore,
  };
}

export const chefOrderHistoryApi = {
  async page(options?: {
    limit?: number;
    cursor?: string | null;
    status?: ChefOperationalOrderStatus | null;
    signal?: AbortSignal;
  }): Promise<ChefOrderHistoryPage> {
    const limit = normalizeLimit(options?.limit);
    const params: Record<string, string | number> = {limit};

    if (options?.cursor) {
      if (options.cursor.length > 512) {
        throw new Error('CHEF_ORDER_HISTORY_CURSOR_INVALID');
      }
      params.cursor = options.cursor;
    }

    if (options?.status) {
      if (!ORDER_STATUSES.has(options.status)) {
        throw new Error('CHEF_ORDER_HISTORY_STATUS_INVALID');
      }
      params.status = options.status;
    }

    const response = await httpClient.get<unknown>(
      '/api/v1/chef/orders/page',
      {
        params,
        signal: options?.signal,
        dedupeKey: `chef-order-history:${limit}:${
          options?.status ?? 'all'
        }:${options?.cursor ?? ''}`,
      },
    );

    const parsed = parseChefOrderHistoryPage(response);
    if (!parsed) {
      throw new Error('CHEF_ORDER_HISTORY_INVALID_RESPONSE');
    }
    return parsed;
  },
};
