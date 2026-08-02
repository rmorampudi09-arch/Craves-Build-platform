export type AppNotification = {
  id: string;
  title: string;
  body: string;
  noticeType: string;
  targetType: string;
  targetId: string | null;
  readAt: string | null;
  createdAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}
function instant(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}
export function parseNotification(value: unknown): AppNotification | null {
  const raw = record(value);
  if (!raw) return null;
  const id = text(raw.id, 64); const title = text(raw.title, 200); const body = text(raw.body, 2_000); const noticeType = text(raw.noticeType, 80); const targetType = text(raw.targetType, 80); const createdAt = instant(raw.createdAt);
  const targetId = raw.targetId == null ? null : text(raw.targetId, 64);
  const readAt = raw.readAt == null ? null : instant(raw.readAt);
  if (!id || !UUID.test(id) || !title || !body || !noticeType || !targetType || !createdAt || (targetId !== null && !UUID.test(targetId)) || (raw.readAt != null && !readAt)) return null;
  return { id, title, body, noticeType, targetType, targetId, readAt, createdAt };
}
export function parseNotifications(value: unknown): AppNotification[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const notices = value.map(parseNotification);
  return notices.some(notice => notice === null) ? null : notices as AppNotification[];
}
export function unreadCount(notices: AppNotification[]): number { return notices.filter(notice => notice.readAt === null).length; }
