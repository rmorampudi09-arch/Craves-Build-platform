const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ORDER_TRACKING_STATUSES = [
  "PAYMENT_PENDING",
  "PAID",
  "CHEF_ACCEPTANCE_PENDING",
  "CHEF_ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CHEF_REJECTED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "REFUND_FAILED",
] as const;

export type OrderTrackingStatus = (typeof ORDER_TRACKING_STATUSES)[number];

export type OrderTrackingEvent = {
  id: string;
  status: OrderTrackingStatus;
  occurredAt: string;
};

export type OrderTrackingTimeline = {
  orderId: string;
  currentStatus: OrderTrackingStatus;
  createdAt: string | null;
  updatedAt: string | null;
  events: OrderTrackingEvent[];
};

function isStatus(value: unknown): value is OrderTrackingStatus {
  return typeof value === "string" && (ORDER_TRACKING_STATUSES as readonly string[]).includes(value);
}

function isDateTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseOrderTrackingTimeline(value: unknown): OrderTrackingTimeline | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.orderId !== "string" || !UUID.test(raw.orderId) || !isStatus(raw.currentStatus)) return null;
  if (raw.createdAt !== null && !isDateTime(raw.createdAt)) return null;
  if (raw.updatedAt !== null && !isDateTime(raw.updatedAt)) return null;
  if (!Array.isArray(raw.events) || raw.events.length > 250) return null;

  const events: OrderTrackingEvent[] = [];
  for (const value of raw.events) {
    if (!value || typeof value !== "object") return null;
    const event = value as Record<string, unknown>;
    if (
      typeof event.id !== "string" ||
      !UUID.test(event.id) ||
      !isStatus(event.status) ||
      !isDateTime(event.occurredAt)
    ) return null;
    events.push({ id: event.id, status: event.status, occurredAt: event.occurredAt });
  }

  return {
    orderId: raw.orderId,
    currentStatus: raw.currentStatus,
    createdAt: raw.createdAt as string | null,
    updatedAt: raw.updatedAt as string | null,
    events,
  };
}
