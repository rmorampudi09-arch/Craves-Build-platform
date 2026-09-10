import type {CustomerDeliveryStatus} from '../domain/customerOrderTrackingTypes';

export type CustomerDeliveryStatusTone =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';

export interface CustomerDeliveryStatusPresentation {
  label: string;
  detail: string;
  stage: number | null;
  tone: CustomerDeliveryStatusTone;
}

export const CUSTOMER_DELIVERY_POLL_INTERVAL_MS = 30_000;

export function isTerminalCustomerDeliveryStatus(
  status: CustomerDeliveryStatus,
): boolean {
  return (
    status === 'DELIVERED' ||
    status === 'CANCELLED' ||
    status === 'RETURNED' ||
    status === 'FAILED'
  );
}

export function getCustomerDeliveryStatusPresentation(
  status: CustomerDeliveryStatus,
): CustomerDeliveryStatusPresentation {
  switch (status) {
    case 'PENDING':
      return {
        label: 'Delivery is being prepared',
        detail: 'Craves is preparing the delivery handoff.',
        stage: 1,
        tone: 'accent',
      };
    case 'SEARCHING':
      return {
        label: 'Finding a delivery partner',
        detail: 'A delivery partner is being matched to your order.',
        stage: 2,
        tone: 'accent',
      };
    case 'COURIER_ASSIGNED':
      return {
        label: 'Delivery partner assigned',
        detail: 'A delivery partner has been assigned.',
        stage: 3,
        tone: 'accent',
      };
    case 'COURIER_TO_PICKUP':
      return {
        label: 'Heading to pickup',
        detail: 'The delivery partner is heading to the kitchen.',
        stage: 4,
        tone: 'accent',
      };
    case 'AT_PICKUP':
      return {
        label: 'At the kitchen',
        detail: 'The delivery partner has reached the pickup point.',
        stage: 5,
        tone: 'accent',
      };
    case 'PICKED_UP':
      return {
        label: 'Order picked up',
        detail: 'Your order has been collected from the kitchen.',
        stage: 6,
        tone: 'accent',
      };
    case 'IN_TRANSIT':
      return {
        label: 'On the way',
        detail: 'Your order is in transit.',
        stage: 7,
        tone: 'accent',
      };
    case 'AT_DROPOFF':
      return {
        label: 'Arriving at your location',
        detail: 'The delivery partner has reached the drop-off area.',
        stage: 8,
        tone: 'accent',
      };
    case 'DELIVERED':
      return {
        label: 'Delivered',
        detail: 'Your order has been delivered.',
        stage: 9,
        tone: 'success',
      };
    case 'DELAYED':
      return {
        label: 'Delivery delayed',
        detail: 'The delivery is taking longer than expected. Check the latest updates below.',
        stage: null,
        tone: 'warning',
      };
    case 'CANCELLED':
      return {
        label: 'Delivery cancelled',
        detail: 'This delivery will not continue.',
        stage: null,
        tone: 'muted',
      };
    case 'RETURNING':
      return {
        label: 'Order returning',
        detail: 'The delivery is returning from the drop-off route.',
        stage: null,
        tone: 'warning',
      };
    case 'RETURNED':
      return {
        label: 'Order returned',
        detail: 'The delivery has been returned.',
        stage: null,
        tone: 'muted',
      };
    case 'FAILED':
      return {
        label: 'Delivery needs attention',
        detail: 'The delivery could not be completed.',
        stage: null,
        tone: 'danger',
      };
  }
}

export function formatCustomerDeliveryTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
