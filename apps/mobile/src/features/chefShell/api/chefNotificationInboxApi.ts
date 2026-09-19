import {httpClient} from '../../../core/http/httpClient';
import type {ChefOperationalNotice} from './chefOperationalApi';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CHEF_NOTIFICATION_INBOX_V2_AVAILABLE = false;
export const CHEF_NOTIFICATION_PAGE_SIZE = 50;

export interface ChefNotificationPage {
  notices: ChefOperationalNotice[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ChefNotificationUnreadCount {
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
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
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

export function parseChefNotification(
  value: unknown,
): ChefOperationalNotice | null {
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

export function parseChefNotificationPage(
  value: unknown,
): ChefNotificationPage | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, PAGE_KEYS) || !Array.isArray(raw.notices)) {
    return null;
  }

  const notices = raw.notices.map(parseChefNotification);
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
    notices: notices as ChefOperationalNotice[],
    nextCursor,
    hasMore: raw.hasMore,
  };
}

export function parseChefNotificationUnreadCount(
  value: unknown,
): ChefNotificationUnreadCount | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, COUNT_KEYS)) return null;

  return typeof raw.unreadCount === 'number' &&
    Number.isSafeInteger(raw.unreadCount) &&
    raw.unreadCount >= 0
    ? {unreadCount: raw.unreadCount}
    : null;
}

function normalizeLimit(limit: number | undefined): number {
  const resolved = limit ?? CHEF_NOTIFICATION_PAGE_SIZE;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 100) {
    throw new Error('CHEF_NOTIFICATION_LIMIT_INVALID');
  }
  return resolved;
}

function requireNoticeId(noticeId: string): string {
  if (!UUID_PATTERN.test(noticeId)) {
    throw new Error('CHEF_NOTIFICATION_ID_INVALID');
  }
  return noticeId;
}

export const chefNotificationInboxApi = {
  async page(options?: {
    limit?: number;
    cursor?: string | null;
    unreadOnly?: boolean;
    signal?: AbortSignal;
  }): Promise<ChefNotificationPage> {
    const limit = normalizeLimit(options?.limit);
    const unreadOnly = options?.unreadOnly ?? false;
    const params: Record<string, string | number | boolean> = {
      limit,
      unreadOnly,
    };

    if (options?.cursor) {
      if (options.cursor.length > 512) {
        throw new Error('CHEF_NOTIFICATION_CURSOR_INVALID');
      }
      params.cursor = options.cursor;
    }

    const response = await httpClient.get<unknown>(
      '/api/v1/notifications/in-app/page',
      {
        params,
        signal: options?.signal,
        dedupeKey: `chef-notification-page:${limit}:${unreadOnly}:${
          options?.cursor ?? ''
        }`,
      },
    );
    const parsed = parseChefNotificationPage(response);
    if (!parsed) {
      throw new Error('CHEF_NOTIFICATION_PAGE_INVALID_RESPONSE');
    }
    return parsed;
  },

  async unreadCount(
    signal?: AbortSignal,
  ): Promise<ChefNotificationUnreadCount> {
    const response = await httpClient.get<unknown>(
      '/api/v1/notifications/in-app/unread-count',
      {
        signal,
        dedupeKey: 'chef-notification-unread-count',
      },
    );
    const parsed = parseChefNotificationUnreadCount(response);
    if (!parsed) {
      throw new Error('CHEF_NOTIFICATION_COUNT_INVALID_RESPONSE');
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
