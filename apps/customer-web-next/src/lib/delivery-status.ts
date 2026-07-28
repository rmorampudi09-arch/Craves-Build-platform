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
  'FAILED',
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type DeliveryStatusHistoryItem = {
  oldStatus: DeliveryStatus | null;
  newStatus: DeliveryStatus;
  trackingUrl: string | null;
  observedAt: string;
  recordedAt: string;
};

export type DeliveryStatusResponse = {
  orderId: string;
  deliveryJobId: string | null;
  providerId: string | null;
  status: DeliveryStatus | null;
  trackingUrl: string | null;
  observedAt: string | null;
  history: DeliveryStatusHistoryItem[];
};

export type DeliveryStatusPresentation = {
  label: string;
  description: string;
  stage: number;
  terminal: boolean;
  attention: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_SET = new Set<string>(DELIVERY_STATUSES);

const PRESENTATION: Record<DeliveryStatus, DeliveryStatusPresentation> = {
  PENDING: { label: 'Delivery is being prepared', description: 'We are preparing the delivery request for your chef-specific order.', stage: 0, terminal: false, attention: false },
  SEARCHING: { label: 'Finding a delivery partner', description: 'Craves is searching for an available delivery partner.', stage: 1, terminal: false, attention: false },
  COURIER_ASSIGNED: { label: 'Delivery partner assigned', description: 'A delivery partner has accepted the delivery.', stage: 2, terminal: false, attention: false },
  COURIER_TO_PICKUP: { label: 'Heading to the chef', description: 'Your delivery partner is travelling to the pickup location.', stage: 3, terminal: false, attention: false },
  AT_PICKUP: { label: 'At the pickup location', description: 'The delivery partner has reached the chef.', stage: 4, terminal: false, attention: false },
  PICKED_UP: { label: 'Order picked up', description: 'Your food has been collected and is ready to travel.', stage: 5, terminal: false, attention: false },
  IN_TRANSIT: { label: 'On the way', description: 'Your order is travelling to your delivery address.', stage: 6, terminal: false, attention: false },
  AT_DROPOFF: { label: 'Arriving now', description: 'The delivery partner has reached the drop-off location.', stage: 7, terminal: false, attention: false },
  DELIVERED: { label: 'Delivered', description: 'Your order has been delivered.', stage: 8, terminal: true, attention: false },
  CANCELLED: { label: 'Delivery cancelled', description: 'This delivery was cancelled. Check the order screen for further updates.', stage: 8, terminal: true, attention: true },
  DELAYED: { label: 'Delivery delayed', description: 'The delivery is taking longer than expected. We will keep this status updated.', stage: 6, terminal: false, attention: true },
  RETURNING: { label: 'Delivery returning', description: 'The delivery is returning to the pickup location.', stage: 7, terminal: false, attention: true },
  RETURNED: { label: 'Delivery returned', description: 'The delivery was returned to the pickup location.', stage: 8, terminal: true, attention: true },
  FAILED: { label: 'Delivery needs support', description: 'The delivery could not be completed. Please contact Craves support.', stage: 8, terminal: true, attention: true },
};

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return typeof value === 'string' && STATUS_SET.has(value);
}

export function presentationFor(status: DeliveryStatus | null): DeliveryStatusPresentation {
  if (status === null) {
    return { label: 'Waiting for delivery updates', description: 'Delivery tracking will appear after a delivery job is created.', stage: 0, terminal: false, attention: false };
  }
  return PRESENTATION[status];
}

export function shouldAutoRefresh(status: DeliveryStatus | null): boolean {
  return status === null || !PRESENTATION[status].terminal;
}

export function safeTrackingUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function nullableString(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' && value.length <= maxLength ? value : null;
}

function isoTimestamp(value: unknown, nullable: boolean): string | null {
  if ((value === null || value === undefined) && nullable) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new DeliveryStatusContractError('Delivery timestamp is invalid');
  }
  return new Date(value).toISOString();
}

export function parseDeliveryStatusResponse(value: unknown): DeliveryStatusResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DeliveryStatusContractError('Delivery status response must be an object');
  }
  const source = value as Record<string, unknown>;
  if (typeof source.orderId !== 'string' || !isUuid(source.orderId)) {
    throw new DeliveryStatusContractError('Delivery status orderId is invalid');
  }
  const status = source.status === null || source.status === undefined
    ? null
    : isDeliveryStatus(source.status)
      ? source.status
      : (() => { throw new DeliveryStatusContractError('Delivery status is unsupported'); })();
  const deliveryJobId = nullableString(source.deliveryJobId, 36);
  if (deliveryJobId !== null && !isUuid(deliveryJobId)) {
    throw new DeliveryStatusContractError('Delivery job identifier is invalid');
  }
  if (!Array.isArray(source.history) || source.history.length > 100) {
    throw new DeliveryStatusContractError('Delivery status history is invalid');
  }
  const history = source.history.map((entry): DeliveryStatusHistoryItem => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new DeliveryStatusContractError('Delivery history entry is invalid');
    }
    const row = entry as Record<string, unknown>;
    const oldStatus = row.oldStatus === null || row.oldStatus === undefined
      ? null
      : isDeliveryStatus(row.oldStatus)
        ? row.oldStatus
        : (() => { throw new DeliveryStatusContractError('Delivery history oldStatus is invalid'); })();
    if (!isDeliveryStatus(row.newStatus)) {
      throw new DeliveryStatusContractError('Delivery history newStatus is invalid');
    }
    return {
      oldStatus,
      newStatus: row.newStatus,
      trackingUrl: safeTrackingUrl(row.trackingUrl),
      observedAt: isoTimestamp(row.observedAt, false) as string,
      recordedAt: isoTimestamp(row.recordedAt, false) as string,
    };
  });
  return {
    orderId: source.orderId,
    deliveryJobId,
    providerId: nullableString(source.providerId, 80),
    status,
    trackingUrl: safeTrackingUrl(source.trackingUrl),
    observedAt: isoTimestamp(source.observedAt, true),
    history,
  };
}

export class DeliveryStatusContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryStatusContractError';
  }
}
