import {httpClient} from '../../../core/http/httpClient';
import {
  CUSTOMER_ORDER_STATUSES,
  type CustomerOrder,
  type CustomerOrderStatus,
} from '../domain/customerOrderTypes';
import {parseCustomerOrderResponse} from './customerOrdersApi';

export const CUSTOMER_ORDER_HISTORY_V2_AVAILABLE = false;
export const CUSTOMER_ORDER_HISTORY_PAGE_SIZE = 20;

export interface CustomerOrderHistoryPage {
  orders: CustomerOrder[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_SET = new Set<string>(CUSTOMER_ORDER_STATUSES);
const PAGE_KEYS = new Set(['orders', 'nextCursor', 'hasMore']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  raw: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(raw);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function normalizeLimit(limit: number | undefined): number {
  const resolved = limit ?? CUSTOMER_ORDER_HISTORY_PAGE_SIZE;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 100) {
    throw new Error('CUSTOMER_ORDER_HISTORY_LIMIT_INVALID');
  }
  return resolved;
}

export function parseCustomerOrderHistoryPage(
  value: unknown,
): CustomerOrderHistoryPage | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, PAGE_KEYS) || !Array.isArray(raw.orders)) {
    return null;
  }

  const orders = raw.orders.map(parseCustomerOrderResponse);
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

  const parsedOrders = orders as CustomerOrder[];
  const seen = new Set<string>();
  let previousCreatedAt = Number.POSITIVE_INFINITY;
  let previousId = '';

  for (const order of parsedOrders) {
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

export const customerOrderHistoryApi = {
  async page(options?: {
    limit?: number;
    cursor?: string | null;
    status?: CustomerOrderStatus | null;
    signal?: AbortSignal;
  }): Promise<CustomerOrderHistoryPage> {
    const limit = normalizeLimit(options?.limit);
    const params: Record<string, string | number> = {limit};

    if (options?.cursor) {
      if (options.cursor.length > 512) {
        throw new Error('CUSTOMER_ORDER_HISTORY_CURSOR_INVALID');
      }
      params.cursor = options.cursor;
    }

    if (options?.status) {
      if (!STATUS_SET.has(options.status)) {
        throw new Error('CUSTOMER_ORDER_HISTORY_STATUS_INVALID');
      }
      params.status = options.status;
    }

    const response = await httpClient.get<unknown>('/api/v1/orders/page', {
      params,
      signal: options?.signal,
      dedupeKey: `customer-order-history:${limit}:${
        options?.status ?? 'all'
      }:${options?.cursor ?? ''}`,
    });

    const parsed = parseCustomerOrderHistoryPage(response);
    if (!parsed) {
      throw new Error('CUSTOMER_ORDER_HISTORY_INVALID_RESPONSE');
    }
    return parsed;
  },
};
