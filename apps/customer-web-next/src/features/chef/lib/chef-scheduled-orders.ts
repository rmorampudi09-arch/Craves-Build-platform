// order-service ChefScheduledOrderController: requests to cook an order at a later time, which the chef confirms or
// declines (GET /api/v1/chef/scheduled-orders, PUT /api/v1/chef/scheduled-orders/{scheduleRequestId}/orders/{orderId}/response).
import { messages, type Language } from "../../../shared/i18n/language.ts";

export type ScheduleResponseStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type SchedulePaymentGate = "PAYMENT_BEFORE_CHEF_CONFIRMATION" | "PAYMENT_AFTER_ALL_CHEFS_CONFIRM";
export type ChefScheduledOrder = {
  scheduleRequestId: string;
  orderId: string;
  requestedFulfilmentAt: string;
  responseStatus: ScheduleResponseStatus;
  /** Paid before the chef confirms, or after every kitchen in the checkout has. */
  paymentGate: SchedulePaymentGate;
  /** Sent back with the answer, so an answer to a changed request is refused. */
  responseVersion: number;
};
export type ChefScheduledOrderPage = { items: ChefScheduledOrder[]; nextCursor: string | null; hasMore: boolean };
export type ChefScheduleAnswer = { action: "ACCEPT" | "REJECT"; responseNote: string | null; expectedVersion: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The order-service cursor: base64url, at most 512 characters. */
export const SCHEDULE_CURSOR = /^[A-Za-z0-9_-]{1,512}$/;
const RESPONSES = new Set<string>(["PENDING", "ACCEPTED", "REJECTED"]);
const GATES = new Set<string>(["PAYMENT_BEFORE_CHEF_CONFIRMATION", "PAYMENT_AFTER_ALL_CHEFS_CONFIRM"]);

const record = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
export const isScheduleUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
export const isScheduleResponseStatus = (value: unknown): value is ScheduleResponseStatus => typeof value === "string" && RESPONSES.has(value);
const version = (value: unknown) => (Number.isSafeInteger(value) && (value as number) >= 1 ? (value as number) : null);

function parseItem(value: unknown): ChefScheduledOrder | null {
  const raw = record(value);
  if (!raw) return null;
  const { scheduleRequestId, orderId, requestedFulfilmentAt, responseStatus, paymentGate } = raw;
  const responseVersion = version(raw.responseVersion);
  return isScheduleUuid(scheduleRequestId) && isScheduleUuid(orderId) && typeof requestedFulfilmentAt === "string" && requestedFulfilmentAt.length <= 40 &&
    !Number.isNaN(Date.parse(requestedFulfilmentAt)) && isScheduleResponseStatus(responseStatus) && typeof paymentGate === "string" && GATES.has(paymentGate) && responseVersion
    ? { scheduleRequestId, orderId, requestedFulfilmentAt, responseStatus, paymentGate: paymentGate as SchedulePaymentGate, responseVersion }
    : null;
}

export function parseChefScheduledOrderPage(value: unknown): ChefScheduledOrderPage | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.items) || raw.items.length > 100 || typeof raw.hasMore !== "boolean") return null;
  const items = raw.items.map(parseItem);
  const nextCursor = raw.nextCursor == null ? null : typeof raw.nextCursor === "string" && SCHEDULE_CURSOR.test(raw.nextCursor) ? raw.nextCursor : undefined;
  if (items.some((item) => !item) || nextCursor === undefined || (raw.hasMore && !nextCursor)) return null;
  return { items: items as ChefScheduledOrder[], nextCursor, hasMore: raw.hasMore };
}

/** The browser's answer, checked before it reaches order-service; a note is trimmed and at most 500 characters. */
export function parseChefScheduleAnswer(value: unknown): ChefScheduleAnswer | null {
  const raw = record(value);
  const note = raw?.responseNote == null ? null : typeof raw.responseNote === "string" ? raw.responseNote.trim() || null : undefined;
  const expectedVersion = version(raw?.expectedVersion);
  return raw && (raw.action === "ACCEPT" || raw.action === "REJECT") && note !== undefined && (note?.length ?? 0) <= 500 && expectedVersion
    ? { action: raw.action, responseNote: note, expectedVersion }
    : null;
}

/** order-service's KitchenScheduleResponseView: the order it answers and where that answer now stands. */
export function parseChefScheduleAnswerResult(value: unknown): { orderId: string; status: ScheduleResponseStatus } | null {
  const raw = record(value);
  return raw && isScheduleUuid(raw.orderId) && isScheduleResponseStatus(raw.status) && version(raw.version) ? { orderId: raw.orderId, status: raw.status } : null;
}

const WORDS = messages({
  en: { today: "Today", tomorrow: "Tomorrow" },
  te: { today: "ఈరోజు", tomorrow: "రేపు" },
  kn: { today: "ಇಂದು", tomorrow: "ನಾಳೆ" },
});
const indiaDay = (time: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(time);

/** "Tomorrow, 1:00 pm", or "Sat, 18 Oct, 12:30 pm" further out, in India time. */
export function scheduleWhen(iso: string, now: Date, language: Language = "en"): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(at).toLowerCase();
  const day = indiaDay(at);
  const label =
    day === indiaDay(now.getTime()) ? WORDS[language].today
      : day === indiaDay(now.getTime() + 86_400_000) ? WORDS[language].tomorrow
        : new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(at);
  return `${label}, ${time}`;
}
