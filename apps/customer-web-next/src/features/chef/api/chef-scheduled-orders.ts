import { sessionFetch } from "@/features/auth/api/sessionFetch";
import {
  parseChefScheduleAnswerResult,
  parseChefScheduledOrderPage,
  type ChefScheduledOrder,
  type ChefScheduledOrderPage,
  type ScheduleResponseStatus,
} from "@/features/chef/lib/chef-scheduled-orders";

/** code is FEATURE_NOT_AVAILABLE (show Coming soon), SESSION_EXPIRED, a backend code such as SCHEDULE_RESPONSE_NOT_PENDING, or a fallback. */
export class ChefScheduledOrdersError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

async function call<T>(path: string, parse: (value: unknown) => T | null, fallback: string, init: RequestInit = {}): Promise<T> {
  const response = await sessionFetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = response.status === 401 ? "SESSION_EXPIRED" : (body as { code?: unknown } | null)?.code;
    throw new ChefScheduledOrdersError(typeof code === "string" ? code : fallback, response.status);
  }
  const parsed = parse(body);
  if (!parsed) throw new ChefScheduledOrdersError(`INVALID_${fallback}_RESPONSE`, 502);
  return parsed;
}

/** Requests in one state, soonest first; pass the previous page's nextCursor for more. */
export function fetchScheduledOrders(responseStatus: ScheduleResponseStatus, options: { limit?: number; cursor?: string | null } = {}): Promise<ChefScheduledOrderPage> {
  const query = new URLSearchParams({ responseStatus, limit: String(options.limit ?? 20) });
  if (options.cursor) query.set("cursor", options.cursor);
  return call(`/api/chef/scheduled-orders?${query}`, parseChefScheduledOrderPage, "CHEF_SCHEDULED_ORDERS");
}

export function answerScheduledOrder(item: ChefScheduledOrder, action: "ACCEPT" | "REJECT", responseNote: string | null = null) {
  return call(
    `/api/chef/scheduled-orders/${item.scheduleRequestId}/orders/${item.orderId}/response`,
    parseChefScheduleAnswerResult,
    "CHEF_SCHEDULE_ANSWER",
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, responseNote, expectedVersion: item.responseVersion }) },
  );
}
