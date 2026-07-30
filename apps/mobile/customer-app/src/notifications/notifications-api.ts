import { CRAVES_API_BASE_URL, NETWORK_TIMEOUT_MS } from '../config';
import type { MobileSession } from '../auth/contracts';
import { parseNotifications, type AppNotification } from './contracts';

export class NotificationsApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

async function fetchWithSession(session: MobileSession, path: string, method: 'GET' | 'PATCH' = 'GET'): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(`${CRAVES_API_BASE_URL}${path}`, { method, headers: { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}` }, signal: controller.signal });
    if (response.status === 401) throw new NotificationsApiError('SESSION_EXPIRED', 401, 'Your session expired. Sign in again.');
    if (!response.ok) throw new NotificationsApiError('NOTIFICATIONS_UNAVAILABLE', response.status, 'Notifications are temporarily unavailable.');
    return response;
  } catch (error) {
    if (error instanceof NotificationsApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new NotificationsApiError('NOTIFICATIONS_TIMEOUT', 504, 'Notification request timed out.');
    throw new NotificationsApiError('NOTIFICATIONS_UNAVAILABLE', 503, 'Check your connection and try again.');
  } finally { clearTimeout(timeout); }
}

export async function listNotifications(session: MobileSession, limit = 50): Promise<AppNotification[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const response = await fetchWithSession(session, `/notifications/in-app?limit=${boundedLimit}`);
  const notices = parseNotifications(await response.json().catch(() => null));
  if (!notices) throw new NotificationsApiError('INVALID_NOTIFICATION_RESPONSE', 502, 'Notifications are temporarily unavailable.');
  return notices;
}

export async function markNotificationRead(session: MobileSession, noticeId: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(noticeId)) throw new NotificationsApiError('INVALID_NOTICE_ID', 400, 'Notification id is invalid.');
  await fetchWithSession(session, `/notifications/in-app/${encodeURIComponent(noticeId)}/read`, 'PATCH');
}
