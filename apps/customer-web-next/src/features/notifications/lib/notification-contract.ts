export type CustomerNotification = {
  id: string; title: string; body: string; noticeType: string; targetType: string | null;
  targetId: string | null; readAt: string | null; createdAt: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function text(value: unknown, max: number): string | null { if (typeof value !== "string") return null; const result = value.trim(); return result && result.length <= max ? result : null; }
function instant(value: unknown): string | null { if (value == null) return null; return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null; }
export function parseCustomerNotification(value: unknown): CustomerNotification | null {
  if (!value || typeof value !== "object") return null; const notice = value as Record<string, unknown>;
  const id = text(notice.id, 64); const title = text(notice.title, 180); const body = text(notice.body, 1_500);
  const noticeType = text(notice.noticeType, 80); const createdAt = instant(notice.createdAt); const readAt = instant(notice.readAt);
  const targetId = text(notice.targetId, 64);
  if (!id || !UUID.test(id) || !title || !body || !noticeType || !createdAt || (targetId && !UUID.test(targetId))) return null;
  return { id, title, body, noticeType, targetType: text(notice.targetType, 80), targetId, readAt, createdAt };
}
export function parseCustomerNotifications(value: unknown): CustomerNotification[] | null {
  if (!Array.isArray(value) || value.length > 100) return null; const notices = value.map(parseCustomerNotification);
  return notices.some((notice) => notice === null) ? null : notices as CustomerNotification[];
}

export type NotificationPage = { notices: CustomerNotification[]; nextCursor: string | null; hasMore: boolean };
/** notification-service AppNoticePageResponse; the cursor is base64url without padding. */
export function parseNotificationPage(value: unknown): NotificationPage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null; const raw = value as Record<string, unknown>;
  const notices = parseCustomerNotifications(raw.notices);
  const nextCursor = raw.nextCursor == null ? null : typeof raw.nextCursor === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(raw.nextCursor) ? raw.nextCursor : undefined;
  if (!notices || nextCursor === undefined || typeof raw.hasMore !== "boolean" || (raw.hasMore && !nextCursor)) return null;
  return { notices, nextCursor, hasMore: raw.hasMore };
}
export function parseUnreadCount(value: unknown): number | null {
  const count = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).unreadCount : null;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : null;
}

// Sent to customers despite the CHEF_ prefix: "the chef accepted/declined your order".
const CUSTOMER_CHEF_TYPES = new Set(["CHEF_ACCEPTED_ORDER", "CHEF_REJECTED_ORDER"]);
export function isKitchenNotice(notice: CustomerNotification): boolean {
  const type = notice.noticeType.toUpperCase();
  return (type.startsWith("CHEF_") && !CUSTOMER_CHEF_TYPES.has(type)) || (notice.targetType ?? "").toUpperCase().startsWith("CHEF_");
}
/** About food the person bought; Chef Mode leaves these to the customer app. Unknown types show in both. */
export function isOwnOrderNotice(notice: CustomerNotification): boolean {
  const type = notice.noticeType.toUpperCase();
  return !isKitchenNotice(notice) && (CUSTOMER_CHEF_TYPES.has(type) || /^(ORDER|PAYMENT|DELIVERY|REFUND)_/.test(type));
}
