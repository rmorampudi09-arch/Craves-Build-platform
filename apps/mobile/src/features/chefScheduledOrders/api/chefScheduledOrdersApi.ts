import {httpClient} from '../../../core/http/httpClient';
import {
  SCHEDULE_KITCHEN_RESPONSE_STATUSES,
  SCHEDULE_PAYMENT_GATES,
  SCHEDULE_STATUSES,
  type KitchenScheduleResponse,
  type ScheduleKitchenResponseStatus,
  type SchedulePaymentGate,
  type ScheduleStatus,
} from '../../scheduledOrders/api/scheduledOrdersApi';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CHEF_SCHEDULED_ORDERS_AVAILABLE = false;
export const CHEF_SCHEDULED_ORDERS_PATH = '/api/v1/chef/scheduled-orders';
export const CHEF_SCHEDULED_ORDERS_PAGE_SIZE = 20;

export const CHEF_SCHEDULE_RESPONSE_ACTIONS = ['ACCEPT', 'REJECT'] as const;
export type ChefScheduleResponseAction =
  (typeof CHEF_SCHEDULE_RESPONSE_ACTIONS)[number];

export interface ChefScheduledOrder {
  scheduleRequestId: string;
  checkoutId: string;
  orderId: string;
  kitchenId: string;
  requestedFulfilmentAt: string;
  requestedTimezone: string;
  scheduleStatus: ScheduleStatus;
  responseStatus: ScheduleKitchenResponseStatus;
  paymentGate: SchedulePaymentGate;
  responseNote: string | null;
  responseVersion: number;
  respondedAt: string | null;
  createdAt: string;
}

export interface ChefScheduledOrderPage {
  items: ChefScheduledOrder[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ChefScheduleResponseRequest {
  action: ChefScheduleResponseAction;
  responseNote: string | null;
  expectedVersion: number;
}

const SCHEDULE_SET = new Set<string>(SCHEDULE_STATUSES);
const RESPONSE_SET = new Set<string>(SCHEDULE_KITCHEN_RESPONSE_STATUSES);
const GATE_SET = new Set<string>(SCHEDULE_PAYMENT_GATES);
const ACTION_SET = new Set<string>(CHEF_SCHEDULE_RESPONSE_ACTIONS);

const ITEM_KEYS = new Set([
  'scheduleRequestId',
  'checkoutId',
  'orderId',
  'kitchenId',
  'requestedFulfilmentAt',
  'requestedTimezone',
  'scheduleStatus',
  'responseStatus',
  'paymentGate',
  'responseNote',
  'responseVersion',
  'respondedAt',
  'createdAt',
]);
const PAGE_KEYS = new Set(['items', 'nextCursor', 'hasMore']);
const RESPONSE_KEYS = new Set([
  'orderId',
  'kitchenId',
  'status',
  'paymentGate',
  'responseNote',
  'version',
  'respondedAt',
]);

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

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function instant(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function nullableInstant(value: unknown): string | null | undefined {
  if (value == null) return null;
  return instant(value) ?? undefined;
}

function timezone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en-US', {timeZone: normalized}).format();
    return normalized;
  } catch {
    return null;
  }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1
    ? value
    : null;
}

function nullableNote(value: unknown): string | null | undefined {
  if (value == null) return null;
  return typeof value === 'string' && value.length <= 500 ? value : undefined;
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
): T | null {
  return typeof value === 'string' && allowed.has(value)
    ? (value as T)
    : null;
}

export function parseChefScheduledOrder(
  value: unknown,
): ChefScheduledOrder | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, ITEM_KEYS)) return null;

  const scheduleRequestId = uuid(raw.scheduleRequestId);
  const checkoutId = uuid(raw.checkoutId);
  const orderId = uuid(raw.orderId);
  const kitchenId = uuid(raw.kitchenId);
  const requestedFulfilmentAt = instant(raw.requestedFulfilmentAt);
  const requestedTimezone = timezone(raw.requestedTimezone);
  const scheduleStatus = parseEnum<ScheduleStatus>(
    raw.scheduleStatus,
    SCHEDULE_SET,
  );
  const responseStatus = parseEnum<ScheduleKitchenResponseStatus>(
    raw.responseStatus,
    RESPONSE_SET,
  );
  const paymentGate = parseEnum<SchedulePaymentGate>(raw.paymentGate, GATE_SET);
  const responseNote = nullableNote(raw.responseNote);
  const responseVersion = positiveInteger(raw.responseVersion);
  const respondedAt = nullableInstant(raw.respondedAt);
  const createdAt = instant(raw.createdAt);

  if (
    !scheduleRequestId ||
    !checkoutId ||
    !orderId ||
    !kitchenId ||
    !requestedFulfilmentAt ||
    !requestedTimezone ||
    !scheduleStatus ||
    !responseStatus ||
    !paymentGate ||
    responseNote === undefined ||
    !responseVersion ||
    respondedAt === undefined ||
    !createdAt
  ) {
    return null;
  }

  if (responseStatus === 'PENDING' && respondedAt !== null) return null;
  if (responseStatus !== 'PENDING' && respondedAt === null) return null;

  return {
    scheduleRequestId,
    checkoutId,
    orderId,
    kitchenId,
    requestedFulfilmentAt,
    requestedTimezone,
    scheduleStatus,
    responseStatus,
    paymentGate,
    responseNote,
    responseVersion,
    respondedAt,
    createdAt,
  };
}

export function parseChefScheduledOrderPage(
  value: unknown,
): ChefScheduledOrderPage | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, PAGE_KEYS) || !Array.isArray(raw.items)) {
    return null;
  }
  const nextCursor =
    raw.nextCursor == null
      ? null
      : typeof raw.nextCursor === 'string' &&
          raw.nextCursor.length > 0 &&
          raw.nextCursor.length <= 512
        ? raw.nextCursor
        : undefined;
  if (
    nextCursor === undefined ||
    typeof raw.hasMore !== 'boolean' ||
    (raw.hasMore && nextCursor === null)
  ) {
    return null;
  }

  const parsed = raw.items.map(parseChefScheduledOrder);
  if (parsed.some(item => item === null)) return null;
  const items = parsed as ChefScheduledOrder[];

  const seen = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const key = `${item.scheduleRequestId}:${item.orderId}`;
    if (seen.has(key)) return null;
    seen.add(key);

    if (index > 0) {
      const previous = items[index - 1];
      const timeDelta =
        Date.parse(item.requestedFulfilmentAt) -
        Date.parse(previous.requestedFulfilmentAt);
      if (
        timeDelta < 0 ||
        (timeDelta === 0 &&
          (item.scheduleRequestId < previous.scheduleRequestId ||
            (item.scheduleRequestId === previous.scheduleRequestId &&
              item.orderId < previous.orderId)))
      ) {
        return null;
      }
    }
  }

  return {items, nextCursor, hasMore: raw.hasMore};
}

export function parseChefScheduleResponse(
  value: unknown,
): KitchenScheduleResponse | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, RESPONSE_KEYS)) return null;

  const orderId = uuid(raw.orderId);
  const kitchenId = uuid(raw.kitchenId);
  const status = parseEnum<ScheduleKitchenResponseStatus>(
    raw.status,
    RESPONSE_SET,
  );
  const paymentGate = parseEnum<SchedulePaymentGate>(raw.paymentGate, GATE_SET);
  const responseNote = nullableNote(raw.responseNote);
  const version = positiveInteger(raw.version);
  const respondedAt = nullableInstant(raw.respondedAt);

  if (
    !orderId ||
    !kitchenId ||
    !status ||
    !paymentGate ||
    responseNote === undefined ||
    !version ||
    respondedAt === undefined
  ) {
    return null;
  }
  if (status === 'PENDING' && respondedAt !== null) return null;
  if (status !== 'PENDING' && respondedAt === null) return null;

  return {
    orderId,
    kitchenId,
    status,
    paymentGate,
    responseNote,
    version,
    respondedAt,
  };
}

function requireUuid(value: string, code: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function normalizeLimit(value: number | undefined): number {
  const limit = value ?? CHEF_SCHEDULED_ORDERS_PAGE_SIZE;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('CHEF_SCHEDULED_ORDER_LIMIT_INVALID');
  }
  return limit;
}

function normalizeCursor(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value.length > 512) throw new Error('CHEF_SCHEDULED_ORDER_CURSOR_INVALID');
  return value;
}

function normalizeStatus<T extends string>(
  value: T | null | undefined,
  allowed: ReadonlySet<string>,
  code: string,
): T | null {
  if (value == null) return null;
  if (!allowed.has(value)) throw new Error(code);
  return value;
}

function normalizeResponseRequest(
  request: ChefScheduleResponseRequest,
): ChefScheduleResponseRequest {
  if (!ACTION_SET.has(request.action)) {
    throw new Error('CHEF_SCHEDULED_ORDER_ACTION_INVALID');
  }
  if (!Number.isSafeInteger(request.expectedVersion) || request.expectedVersion < 1) {
    throw new Error('CHEF_SCHEDULED_ORDER_VERSION_INVALID');
  }
  const note = request.responseNote?.trim() || null;
  if (note && note.length > 500) {
    throw new Error('CHEF_SCHEDULED_ORDER_NOTE_TOO_LONG');
  }
  return {
    action: request.action,
    responseNote: note,
    expectedVersion: request.expectedVersion,
  };
}

export const chefScheduledOrdersApi = {
  async list(options?: {
    scheduleStatus?: ScheduleStatus | null;
    responseStatus?: ScheduleKitchenResponseStatus | null;
    limit?: number;
    cursor?: string | null;
    signal?: AbortSignal;
  }): Promise<ChefScheduledOrderPage> {
    const limit = normalizeLimit(options?.limit);
    const cursor = normalizeCursor(options?.cursor);
    const scheduleStatus = normalizeStatus(
      options?.scheduleStatus,
      SCHEDULE_SET,
      'CHEF_SCHEDULED_ORDER_STATUS_INVALID',
    );
    const responseStatus = normalizeStatus(
      options?.responseStatus,
      RESPONSE_SET,
      'CHEF_SCHEDULED_ORDER_RESPONSE_STATUS_INVALID',
    );

    const params: Record<string, string | number> = {limit};
    if (scheduleStatus) params.scheduleStatus = scheduleStatus;
    if (responseStatus) params.responseStatus = responseStatus;
    if (cursor) params.cursor = cursor;

    const response = await httpClient.get<unknown>(CHEF_SCHEDULED_ORDERS_PATH, {
      params,
      signal: options?.signal,
      dedupeKey: `chef-scheduled-orders:${scheduleStatus ?? 'all'}:${
        responseStatus ?? 'all'
      }:${limit}:${cursor ?? ''}`,
    });
    const parsed = parseChefScheduledOrderPage(response);
    if (!parsed) {
      throw new Error('CHEF_SCHEDULED_ORDER_PAGE_INVALID_RESPONSE');
    }
    return parsed;
  },

  async respond(
    scheduleRequestId: string,
    orderId: string,
    request: ChefScheduleResponseRequest,
    signal?: AbortSignal,
  ): Promise<KitchenScheduleResponse> {
    const scheduleId = requireUuid(
      scheduleRequestId,
      'CHEF_SCHEDULED_ORDER_REQUEST_ID_INVALID',
    );
    const ownedOrderId = requireUuid(
      orderId,
      'CHEF_SCHEDULED_ORDER_ORDER_ID_INVALID',
    );
    const body = normalizeResponseRequest(request);

    const response = await httpClient.put<unknown>(
      `${CHEF_SCHEDULED_ORDERS_PATH}/${encodeURIComponent(
        scheduleId,
      )}/orders/${encodeURIComponent(ownedOrderId)}/response`,
      body,
      {signal},
    );
    const parsed = parseChefScheduleResponse(response);
    if (!parsed || parsed.orderId !== ownedOrderId) {
      throw new Error('CHEF_SCHEDULED_ORDER_RESPONSE_INVALID_RESPONSE');
    }
    if (
      (body.action === 'ACCEPT' && parsed.status !== 'ACCEPTED') ||
      (body.action === 'REJECT' && parsed.status !== 'REJECTED')
    ) {
      throw new Error('CHEF_SCHEDULED_ORDER_RESPONSE_STATUS_MISMATCH');
    }
    return parsed;
  },
};
