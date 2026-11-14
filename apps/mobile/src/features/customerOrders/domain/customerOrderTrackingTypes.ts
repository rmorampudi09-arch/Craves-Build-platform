export const CUSTOMER_DELIVERY_STATUSES = [
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

export type CustomerDeliveryStatus = (typeof CUSTOMER_DELIVERY_STATUSES)[number];

export interface CustomerDeliveryHistoryEntry {
  oldStatus: CustomerDeliveryStatus | null;
  newStatus: CustomerDeliveryStatus;
  trackingUrl: string | null;
  observedAt: string;
  recordedAt: string;
}

export interface CustomerCourierLocation {
  latitude: number;
  longitude: number;
  observedAt: string;
}

export interface CustomerOrderTracking {
  orderId: string;
  deliveryJobId: string | null;
  providerId: string | null;
  status: CustomerDeliveryStatus | null;
  trackingUrl: string | null;
  observedAt: string | null;
  history: readonly CustomerDeliveryHistoryEntry[];
  /** The delivery partner's last reported position; null until the server reports one. */
  courierLocation: CustomerCourierLocation | null;
  /** The 4 digits the customer gives a Craves rider at the door; null for other delivery partners. */
  deliveryCode: string | null;
  /** Google encoded polyline (precision 5) of the road path kitchen to house; null when unknown. */
  routePath: string | null;
}
