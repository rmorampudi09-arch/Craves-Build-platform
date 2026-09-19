import {httpClient} from '../../../core/http/httpClient';
import type {CustomerNotice} from '../../customerShell/api/customerShellApi';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE = false;

export interface CustomerNotificationPage {
  notices: CustomerNotice[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CustomerNotificationUnreadCount {
  unreadCount: number;
}

const NOTICE_KEYS = new Set([
  'id',
  'title',
  'body',
  'noticeType',
  'targetType',
  'targetId',
  'readAt',
  'createdAt',
]);
const PAGE_KEYS = new Set(['notices', 'nextCursor', 'hasMore']);
const COUNT_KEYS = new Set(['unreadCount']);

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

function boundedText(
  value: unknown,
  maximum: number,
  nullable = false,
): string | null | undefined {
  if (nullable && value == null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : undefined;
}

function timestamp(
  value: unknown,
  nullable = false,
): string | null | undefined {
  if (nullable && value == null) return null;
  return typeof value === 'string' &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

export function parseCustomerNotification(
  value: unknown,
): CustomerNotice | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, NOTICE_KEYS)) return null;

  const id =
    typeof raw.id === 'string' && UUID_PATTERN.test(raw.id) ? raw.id : null;
  const title = boundedText(raw.title, 200);
  const body = boundedText(raw.body, 2000);
  const noticeType = boundedText(raw.noticeType, 80, true);
  const targetType = boundedText(raw.targetType, 80, true);
  const targetId =
    raw.targetId == null
      ? null
      : typeof raw.targetId === 'string' && UUID_PATTERN.test(raw.targetId)
        ? raw.targetId
        : undefined;
  const readAt = timestamp(raw.readAt, true);
  const createdAt = timestamp(raw.createdAt);

  if (
    !id ||
    !title ||
    !body ||
    noticeType === undefined ||
    targetType === undefined ||
    targetId === undefined ||
    readAt === undefined ||
    !createdAt
  ) {
    return null;
  }

  return {
    id,
    title,
    body,
    noticeType,
    targetType,
    targetId,
    readAt,
    createdAt,
  };
}

export function parseCustomerNotificationPage(
  value: unknown,
): CustomerNotificationPage | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, PAGE_KEYS) || !Array.isArray(raw.notices)) {
    return null;
  }

  const notices = raw.notices.map(parseCustomerNotification);
  const nextCursor =
    raw.nextCursor == null
      ? null
      : typeof raw.nextCursor === 'string' &&
          raw.nextCursor.length > 0 &&
          raw.nextCursor.length <= 512
        ? raw.nextCursor
        : undefined;

  if (
    notices.some(notice => notice === null) ||
    nextCursor === undefined ||
    typeof raw.hasMore !== 'boolean' ||
    (raw.hasMore && nextCursor === null)
  ) {
    return null;
  }

  return {
    notices: notices as CustomerNotice[],
    nextCursor,
    hasMore: raw.hasMore,
  };
}

export function parseCustomerNotificationUnreadCount(
  value: unknown,
): CustomerNotificationUnreadCount | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, COUNT_KEYS)) return null;

  return typeof raw.unreadCount === 'number' &&
    Number.isSafeInteger(raw.unreadCount) &&
    raw.unreadCount >= 0
    ? {unreadCount: raw.unreadCount}
    : null;
}

function normalizeLimit(limit: number | undefined): number {
  const resolved = limit ?? 50;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 100) {
    throw new Error('CUSTOMER_NOTIFICATION_LIMIT_INVALID');
  }
  return resolved;
}

function requireNoticeId(noticeId: string): string {
  if (!UUID_PATTERN.test(noticeId)) {
    throw new Error('CUSTOMER_NOTIFICATION_ID_INVALID');
  }
  return noticeId;
}

export const customerNotificationInboxApi = {
  async page(options?: {
    limit?: number;
    cursor?: string | null;
    unreadOnly?: boolean;
    signal?: AbortSignal;
  }): Promise<CustomerNotificationPage> {
    const limit = normalizeLimit(options?.limit);
    const unreadOnly = options?.unreadOnly ?? false;
    const params: Record<string, string | number | boolean> = {
      limit,
      unreadOnly,
    };
    if (options?.cursor) params.cursor = options.cursor;

    const response = await httpClient.get<unknown>(
      '/api/v1/notifications/in-app/page',
      {
        params,
        signal: options?.signal,
        dedupeKey: `customer-notification-page:${limit}:${unreadOnly}:${
          options?.cursor ?? ''
        }`,
      },
    );
    const parsed = parseCustomerNotificationPage(response);
    if (!parsed) {
      throw new Error('CUSTOMER_NOTIFICATION_PAGE_INVALID_RESPONSE');
    }
    return parsed;
  },

  async unreadCount(
    signal?: AbortSignal,
  ): Promise<CustomerNotificationUnreadCount> {
    const response = await httpClient.get<unknown>(
      '/api/v1/notifications/in-app/unread-count',
      {
        signal,
        dedupeKey: 'customer-notification-unread-count',
      },
    );
    const parsed = parseCustomerNotificationUnreadCount(response);
    if (!parsed) {
      throw new Error('CUSTOMER_NOTIFICATION_COUNT_INVALID_RESPONSE');
    }
    return parsed;
  },

  async markRead(noticeId: string, signal?: AbortSignal): Promise<void> {
    const id = requireNoticeId(noticeId);
    await httpClient.patch<void>(
      `/api/v1/notifications/in-app/${encodeURIComponent(id)}/read`,
      undefined,
      {signal},
    );
  },

  async markAllRead(signal?: AbortSignal): Promise<void> {
    await httpClient.patch<void>(
      '/api/v1/notifications/in-app/read-all',
      undefined,
      {signal},
    );
  },
};
