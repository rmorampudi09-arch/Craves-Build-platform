import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SCHEDULE_PAYMENT_GATES = [
  'PAYMENT_BEFORE_CHEF_CONFIRMATION',
  'PAYMENT_AFTER_ALL_CHEFS_CONFIRM',
] as const;
export const SCHEDULE_STATUSES = [
  'PENDING_CHEF_CONFIRMATION',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
] as const;
export const SCHEDULE_KITCHEN_RESPONSE_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
] as const;

export type SchedulePaymentGate = (typeof SCHEDULE_PAYMENT_GATES)[number];
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];
export type ScheduleKitchenResponseStatus =
  (typeof SCHEDULE_KITCHEN_RESPONSE_STATUSES)[number];

export interface ScheduleCapability {
  checkoutId: string;
  supported: boolean;
  effectiveMinLeadMinutes: number | null;
  effectiveMaxHorizonMinutes: number | null;
  paymentGate: SchedulePaymentGate | null;
  blockers: string[];
}

export interface CreateScheduleRequest {
  requestedFulfilmentAt: string;
  requestedTimezone: string;
}

export interface KitchenScheduleResponse {
  orderId: string;
  kitchenId: string;
  status: ScheduleKitchenResponseStatus;
  paymentGate: SchedulePaymentGate;
  responseNote: string | null;
  version: number;
  respondedAt: string | null;
}

export interface ScheduleRequest {
  scheduleRequestId: string;
  checkoutId: string;
  requestedFulfilmentAt: string;
  requestedTimezone: string;
  status: ScheduleStatus;
  version: number;
  kitchens: KitchenScheduleResponse[];
  createdAt: string;
  updatedAt: string;
}

const PAYMENT_GATE_SET = new Set<SchedulePaymentGate>(SCHEDULE_PAYMENT_GATES);
const SCHEDULE_STATUS_SET = new Set<ScheduleStatus>(SCHEDULE_STATUSES);
const KITCHEN_STATUS_SET = new Set<ScheduleKitchenResponseStatus>(
  SCHEDULE_KITCHEN_RESPONSE_STATUSES,
);

const CAPABILITY_KEYS = new Set([
  'checkoutId',
  'supported',
  'effectiveMinLeadMinutes',
  'effectiveMaxHorizonMinutes',
  'paymentGate',
  'blockers',
]);

const SCHEDULE_KEYS = new Set([
  'scheduleRequestId',
  'checkoutId',
  'requestedFulfilmentAt',
  'requestedTimezone',
  'status',
  'version',
  'kitchens',
  'createdAt',
  'updatedAt',
]);

const KITCHEN_KEYS = new Set([
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
  raw: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(raw);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1
    ? value
    : null;
}

function nonNegativeIntegerOrNull(value: unknown): number | null | undefined {
  if (value == null) return null;
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : undefined;
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

function paymentGate(value: unknown): SchedulePaymentGate | null {
  return typeof value === 'string' &&
    PAYMENT_GATE_SET.has(value as SchedulePaymentGate)
    ? (value as SchedulePaymentGate)
    : null;
}

function nullablePaymentGate(
  value: unknown,
): SchedulePaymentGate | null | undefined {
  if (value == null) return null;
  return paymentGate(value) ?? undefined;
}

function boundedNullableString(
  value: unknown,
  maximum: number,
): string | null | undefined {
  if (value == null) return null;
  return typeof value === 'string' && value.length <= maximum
    ? value
    : undefined;
}

export function parseScheduleCapability(
  value: unknown,
): ScheduleCapability | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, CAPABILITY_KEYS)) return null;

  const checkoutId = uuid(raw.checkoutId);
  const effectiveMinLeadMinutes = nonNegativeIntegerOrNull(
    raw.effectiveMinLeadMinutes,
  );
  const effectiveMaxHorizonMinutes = nonNegativeIntegerOrNull(
    raw.effectiveMaxHorizonMinutes,
  );
  const gate = nullablePaymentGate(raw.paymentGate);

  if (
    !checkoutId ||
    typeof raw.supported !== 'boolean' ||
    effectiveMinLeadMinutes === undefined ||
    effectiveMaxHorizonMinutes === undefined ||
    gate === undefined ||
    !Array.isArray(raw.blockers) ||
    raw.blockers.length > 100 ||
    raw.blockers.some(
      blocker =>
        typeof blocker !== 'string' || !blocker || blocker.length > 160,
    )
  ) {
    return null;
  }

  if (
    raw.supported &&
    (effectiveMinLeadMinutes === null ||
      effectiveMaxHorizonMinutes === null ||
      effectiveMaxHorizonMinutes <= effectiveMinLeadMinutes ||
      gate === null ||
      raw.blockers.length !== 0)
  ) {
    return null;
  }

  return {
    checkoutId,
    supported: raw.supported,
    effectiveMinLeadMinutes,
    effectiveMaxHorizonMinutes,
    paymentGate: gate,
    blockers: [...raw.blockers] as string[],
  };
}

function parseKitchenScheduleResponse(
  value: unknown,
): KitchenScheduleResponse | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, KITCHEN_KEYS)) return null;

  const orderId = uuid(raw.orderId);
  const kitchenId = uuid(raw.kitchenId);
  const status =
    typeof raw.status === 'string' &&
    KITCHEN_STATUS_SET.has(raw.status as ScheduleKitchenResponseStatus)
      ? (raw.status as ScheduleKitchenResponseStatus)
      : null;
  const gate = paymentGate(raw.paymentGate);
  const responseNote = boundedNullableString(raw.responseNote, 500);
  const version = positiveInteger(raw.version);
  const respondedAt = nullableInstant(raw.respondedAt);

  if (
    !orderId ||
    !kitchenId ||
    !status ||
    !gate ||
    responseNote === undefined ||
    !version ||
    respondedAt === undefined
  ) {
    return null;
  }

  if (
    (status === 'PENDING' &&
      (responseNote !== null || respondedAt !== null)) ||
    (status !== 'PENDING' && respondedAt === null)
  ) {
    return null;
  }

  return {
    orderId,
    kitchenId,
    status,
    paymentGate: gate,
    responseNote,
    version,
    respondedAt,
  };
}

export function parseScheduleRequest(value: unknown): ScheduleRequest | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, SCHEDULE_KEYS) || !Array.isArray(raw.kitchens)) {
    return null;
  }

  const scheduleRequestId = uuid(raw.scheduleRequestId);
  const checkoutId = uuid(raw.checkoutId);
  const requestedFulfilmentAt = instant(raw.requestedFulfilmentAt);
  const requestedTimezone = timezone(raw.requestedTimezone);
  const status =
    typeof raw.status === 'string' &&
    SCHEDULE_STATUS_SET.has(raw.status as ScheduleStatus)
      ? (raw.status as ScheduleStatus)
      : null;
  const version = positiveInteger(raw.version);
  const createdAt = instant(raw.createdAt);
  const updatedAt = instant(raw.updatedAt);

  if (
    !scheduleRequestId ||
    !checkoutId ||
    !requestedFulfilmentAt ||
    !requestedTimezone ||
    !status ||
    !version ||
    !createdAt ||
    !updatedAt ||
    raw.kitchens.length === 0 ||
    raw.kitchens.length > 100
  ) {
    return null;
  }

  const kitchens = raw.kitchens.map(parseKitchenScheduleResponse);
  if (
    kitchens.some(item => item === null) ||
    new Set(
      (kitchens as KitchenScheduleResponse[]).map(item => item.orderId),
    ).size !== kitchens.length
  ) {
    return null;
  }

  return {
    scheduleRequestId,
    checkoutId,
    requestedFulfilmentAt,
    requestedTimezone,
    status,
    version,
    kitchens: kitchens as KitchenScheduleResponse[],
    createdAt,
    updatedAt,
  };
}

export function buildCreateScheduleRequest(input: {
  requestedFulfilmentAt: string;
  requestedTimezone: string;
}): CreateScheduleRequest {
  const requestedFulfilmentAt = instant(input.requestedFulfilmentAt);
  const requestedTimezone = timezone(input.requestedTimezone);

  if (
    !requestedFulfilmentAt ||
    Date.parse(requestedFulfilmentAt) <= Date.now()
  ) {
    throw new Error('SCHEDULE_TIME_NOT_FUTURE');
  }
  if (!requestedTimezone) {
    throw new Error('SCHEDULE_TIMEZONE_INVALID');
  }

  return {requestedFulfilmentAt, requestedTimezone};
}

function requireCheckoutId(checkoutId: string): void {
  if (!UUID_PATTERN.test(checkoutId)) {
    throw new Error('SCHEDULE_CHECKOUT_ID_INVALID');
  }
}

function requireIdempotencyKey(idempotencyKey: string): string {
  const normalized = idempotencyKey.trim();
  if (normalized.length < 8 || normalized.length > 128) {
    throw new Error('SCHEDULE_IDEMPOTENCY_KEY_INVALID');
  }
  return normalized;
}

function requireCapability(
  value: unknown,
  checkoutId: string,
): ScheduleCapability {
  const parsed = parseScheduleCapability(value);
  if (!parsed || parsed.checkoutId !== checkoutId) {
    throw new Error('SCHEDULE_CAPABILITY_INVALID_RESPONSE');
  }
  return parsed;
}

function requireSchedule(value: unknown, checkoutId: string): ScheduleRequest {
  const parsed = parseScheduleRequest(value);
  if (!parsed || parsed.checkoutId !== checkoutId) {
    throw new Error('SCHEDULE_INVALID_RESPONSE');
  }
  return parsed;
}

function scheduleRoute(checkoutId: string): string {
  return `/api/v1/checkouts/${checkoutId}/schedule`;
}

export const scheduledOrdersApi = {
  async getCapability(
    checkoutId: string,
    signal?: AbortSignal,
  ): Promise<ScheduleCapability> {
    requireCheckoutId(checkoutId);
    return requireCapability(
      await httpClient.get<unknown>(`${scheduleRoute(checkoutId)}/capability`, {
        signal,
        dedupeKey: `scheduled-order-capability:${checkoutId}`,
      }),
      checkoutId,
    );
  },

  async create(
    checkoutId: string,
    idempotencyKey: string,
    request: CreateScheduleRequest,
    signal?: AbortSignal,
  ): Promise<ScheduleRequest> {
    requireCheckoutId(checkoutId);
    const key = requireIdempotencyKey(idempotencyKey);
    const body = buildCreateScheduleRequest(request);

    return requireSchedule(
      await httpClient.post<unknown>(scheduleRoute(checkoutId), body, {
        signal,
        headers: {'Idempotency-Key': key},
      }),
      checkoutId,
    );
  },

  async get(
    checkoutId: string,
    signal?: AbortSignal,
  ): Promise<ScheduleRequest> {
    requireCheckoutId(checkoutId);
    return requireSchedule(
      await httpClient.get<unknown>(scheduleRoute(checkoutId), {
        signal,
        dedupeKey: `scheduled-order:${checkoutId}`,
      }),
      checkoutId,
    );
  },

  async withdraw(
    checkoutId: string,
    signal?: AbortSignal,
  ): Promise<ScheduleRequest> {
    requireCheckoutId(checkoutId);
    return requireSchedule(
      await httpClient.delete<unknown>(scheduleRoute(checkoutId), {signal}),
      checkoutId,
    );
  },
};
