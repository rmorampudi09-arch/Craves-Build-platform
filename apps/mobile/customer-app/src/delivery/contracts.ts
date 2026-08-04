export const DELIVERY_STATUSES = [
  'PENDING',
  'SEARCHING',
  'COURIER_ASSIGNED',
  'COURIER_TO_PICKUP',
  'AT_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_DROPOFF',
  'DELIVERED',
  'CANCELLED',
  'DELAYED',
  'RETURNING',
  'RETURNED',
  'FAILED'
] as const;

export type DeliveryStatus = typeof DELIVERY_STATUSES[number];

export type DeliveryHistory = {
  oldStatus: DeliveryStatus | null;
  newStatus: DeliveryStatus;
  trackingUrl: string | null;
  observedAt: string;
  recordedAt: string;
};

export type DeliveryProjection = {
  orderId: string;
  deliveryJobId: string | null;
  providerId: string | null;
  status: DeliveryStatus | null;
  trackingUrl: string | null;
  observedAt: string | null;
  history: DeliveryHistory[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_SET = new Set<string>(DELIVERY_STATUSES);
const TERMINAL = new Set<DeliveryStatus>(['DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED']);

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

function status(value: unknown, nullable = false): DeliveryStatus | null {
  if (nullable && (value === null || value === undefined)) return null;
  return typeof value === 'string' && STATUS_SET.has(value) ? value as DeliveryStatus : null;
}

function instant(value: unknown, nullable = false): string | null {
  if (nullable && (value === null || value === undefined)) return null;
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function safeHttpsUrl(value: unknown): string | null {
  const raw = text(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseHistory(value: unknown): DeliveryHistory | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const newStatus = status(item.newStatus);
  const oldStatus = status(item.oldStatus, true);
  const observedAt = instant(item.observedAt);
  const recordedAt = instant(item.recordedAt);
  const invalidOldStatus = item.oldStatus !== null && item.oldStatus !== undefined && oldStatus === null;
  if (!newStatus || invalidOldStatus || !observedAt || !recordedAt) return null;
  return {
    oldStatus,
    newStatus,
    trackingUrl: safeHttpsUrl(item.trackingUrl),
    observedAt,
    recordedAt
  };
}

export function parseDeliveryProjection(value: unknown): DeliveryProjection | null {
  if (!value || typeof value !== 'object') return null;
  const projection = value as Record<string, unknown>;
  const orderId = text(projection.orderId, 64);
  const deliveryJobId = text(projection.deliveryJobId, 64);
  const providerId = text(projection.providerId, 80);
  const currentStatus = status(projection.status, true);
  const observedAt = instant(projection.observedAt, true);
  const historyInput = Array.isArray(projection.history) ? projection.history : [];
  const invalidCurrentStatus = projection.status !== null && projection.status !== undefined && currentStatus === null;
  if (!orderId || !UUID.test(orderId) || (deliveryJobId && !UUID.test(deliveryJobId)) || invalidCurrentStatus || historyInput.length > 100) return null;
  const history = historyInput.map(parseHistory);
  if (history.some(item => item === null)) return null;
  return {
    orderId,
    deliveryJobId,
    providerId,
    status: currentStatus,
    trackingUrl: safeHttpsUrl(projection.trackingUrl),
    observedAt,
    history: history as DeliveryHistory[]
  };
}

export function isTerminalDeliveryStatus(value: DeliveryStatus | null): boolean {
  return value !== null && TERMINAL.has(value);
}

export function formatDeliveryStatus(value: DeliveryStatus | null): string {
  if (!value) return 'Delivery is being prepared';
  return value.toLowerCase().split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

export function deliveryProgress(value: DeliveryStatus | null): number {
  if (!value) return 0;
  const progress: Partial<Record<DeliveryStatus, number>> = {
    PENDING: 5,
    SEARCHING: 12,
    COURIER_ASSIGNED: 22,
    COURIER_TO_PICKUP: 34,
    AT_PICKUP: 44,
    PICKED_UP: 58,
    IN_TRANSIT: 72,
    AT_DROPOFF: 90,
    DELIVERED: 100,
    DELAYED: 55,
    RETURNING: 70,
    RETURNED: 100,
    CANCELLED: 100,
    FAILED: 100
  };
  return progress[value] ?? 0;
}
