// Mirrors user-chef-service SupportCaseDtos (requester view). Browser-safe.
export type SupportCaseStatus = "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED";
export type SupportCaseRole = "CUSTOMER" | "CHEF";

export type SupportCaseSummary = {
  id: string;
  caseNumber: string;
  requesterRole: SupportCaseRole;
  orderId: string | null;
  subject: string;
  status: SupportCaseStatus;
  lastRequesterMessageAt: string | null;
  lastSupportMessageAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportCaseMessage = { id: string; senderRole: SupportCaseRole | "SUPPORT"; body: string; createdAt: string };
/** One case with its conversation (the backend's SupportCaseDetailResponse, flattened). */
export type SupportCase = SupportCaseSummary & { messages: SupportCaseMessage[] };
export type SupportCasePage = { items: SupportCaseSummary[]; nextCursor: string | null };

export const SUPPORT_SUBJECT_MAX = 160;
export const SUPPORT_MESSAGE_MAX = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED"]);
const ROLES = new Set(["CUSTOMER", "CHEF"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && Array.from(result).length <= max ? result : null;
}
function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}
function instant(value: unknown): string | null {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? value : null;
}
/** null for null/absent, undefined for a bad value. */
function optionalInstant(value: unknown): string | null | undefined {
  return value == null ? null : instant(value) ?? undefined;
}

export function parseSupportCaseSummary(value: unknown): SupportCaseSummary | null {
  const raw = record(value);
  if (!raw) return null;
  const id = uuid(raw.id), caseNumber = typeof raw.caseNumber === "string" && /^[A-Z0-9-]{1,40}$/.test(raw.caseNumber) ? raw.caseNumber : null;
  const requesterRole = typeof raw.requesterRole === "string" && ROLES.has(raw.requesterRole) ? raw.requesterRole as SupportCaseRole : null;
  const orderId = raw.orderId == null ? null : uuid(raw.orderId), subject = text(raw.subject, SUPPORT_SUBJECT_MAX);
  const status = typeof raw.status === "string" && STATUSES.has(raw.status) ? raw.status as SupportCaseStatus : null;
  const lastRequesterMessageAt = optionalInstant(raw.lastRequesterMessageAt), lastSupportMessageAt = optionalInstant(raw.lastSupportMessageAt);
  const resolvedAt = optionalInstant(raw.resolvedAt), closedAt = optionalInstant(raw.closedAt), createdAt = instant(raw.createdAt), updatedAt = instant(raw.updatedAt);
  if (!id || !caseNumber || !requesterRole || (raw.orderId != null && !orderId) || !subject || !status || lastRequesterMessageAt === undefined || lastSupportMessageAt === undefined || resolvedAt === undefined || closedAt === undefined || !createdAt || !updatedAt) return null;
  return { id, caseNumber, requesterRole, orderId, subject, status, lastRequesterMessageAt, lastSupportMessageAt, resolvedAt, closedAt, createdAt, updatedAt };
}

export function parseSupportCaseMessage(value: unknown): SupportCaseMessage | null {
  const raw = record(value);
  if (!raw) return null;
  const id = uuid(raw.id), body = text(raw.body, SUPPORT_MESSAGE_MAX), createdAt = instant(raw.createdAt);
  const senderRole = raw.senderRole === "SUPPORT" || (typeof raw.senderRole === "string" && ROLES.has(raw.senderRole)) ? raw.senderRole as SupportCaseMessage["senderRole"] : null;
  // The requester view never carries internal notes; one here means the wrong endpoint answered.
  if (!id || !body || !createdAt || !senderRole || raw.internalNote === true) return null;
  return { id, senderRole, body, createdAt };
}

/** The backend's {supportCase, messages, statusHistory}, or the BFF's flattened copy of it. */
export function parseSupportCase(value: unknown): SupportCase | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.messages) || raw.messages.length > 1000) return null;
  const summary = parseSupportCaseSummary(raw.supportCase ?? raw);
  const messages = raw.messages.map(parseSupportCaseMessage);
  return summary && !messages.some(message => message === null) ? { ...summary, messages: messages as SupportCaseMessage[] } : null;
}

/** The backend's {cases, nextCursor, hasMore}, or the BFF's {items, nextCursor}. */
export function parseSupportCasePage(value: unknown): SupportCasePage | null {
  const raw = record(value);
  const list = raw?.cases ?? raw?.items;
  if (!raw || !Array.isArray(list) || list.length > 100) return null;
  const items = list.map(parseSupportCaseSummary);
  const nextCursor = raw.nextCursor == null ? null : typeof raw.nextCursor === "string" && raw.nextCursor.length >= 1 && raw.nextCursor.length <= 512 ? raw.nextCursor : undefined;
  return items.some(item => item === null) || nextCursor === undefined ? null : { items: items as SupportCaseSummary[], nextCursor };
}
