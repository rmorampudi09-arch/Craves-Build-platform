import {z} from 'zod';
import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {isCustomerOrderId} from './customerOrdersApi';
import {
  CUSTOMER_DELIVERY_STATUSES,
  type CustomerOrderTracking,
} from '../domain/customerOrderTrackingTypes';

export const customerOrderTrackingPath = (orderId: string) =>
  `/api/v1/orders/${orderId}/delivery-status`;

const timestampSchema = z.string().refine(value => !Number.isNaN(Date.parse(value)));
const nullableTimestampSchema = timestampSchema.nullable();
const statusSchema = z.enum(CUSTOMER_DELIVERY_STATUSES);

function nullableTrimmed(maxLength: number) {
  return z
    .string()
    .max(maxLength)
    .nullable()
    .transform(value => {
      const normalized = value?.trim() ?? '';
      return normalized ? normalized : null;
    });
}

const safeTrackingUrlSchema = z
  .string()
  .url()
  .max(2048)
  .nullable()
  .transform(value => (value?.startsWith('https://') ? value : null));

const historySchema = z.object({
  oldStatus: statusSchema.nullable(),
  newStatus: statusSchema,
  trackingUrl: safeTrackingUrlSchema,
  observedAt: timestampSchema,
  recordedAt: timestampSchema,
});

const trackingSchema = z.object({
  orderId: z.string().uuid(),
  deliveryJobId: z.string().uuid().nullable(),
  providerId: nullableTrimmed(120),
  status: statusSchema.nullable(),
  trackingUrl: safeTrackingUrlSchema,
  observedAt: nullableTimestampSchema,
  history: z.array(historySchema).max(100),
});

export function parseCustomerOrderTrackingResponse(
  value: unknown,
): CustomerOrderTracking | null {
  const parsed = trackingSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const projection = parsed.data;
  if (projection.status === null) {
    if (
      projection.deliveryJobId !== null ||
      projection.providerId !== null ||
      projection.trackingUrl !== null ||
      projection.observedAt !== null ||
      projection.history.length !== 0
    ) {
      return null;
    }
    return projection;
  }

  if (projection.observedAt === null) {
    return null;
  }

  let previousObservedAt = Number.NEGATIVE_INFINITY;
  let previousRecordedAt = Number.NEGATIVE_INFINITY;
  for (const entry of projection.history) {
    const observedAt = Date.parse(entry.observedAt);
    const recordedAt = Date.parse(entry.recordedAt);
    if (
      observedAt < previousObservedAt ||
      (observedAt === previousObservedAt && recordedAt < previousRecordedAt)
    ) {
      return null;
    }
    previousObservedAt = observedAt;
    previousRecordedAt = recordedAt;
  }

  return projection;
}

export const customerOrderTrackingApi = {
  async getTracking(
    orderId: string,
    signal?: AbortSignal,
  ): Promise<CustomerOrderTracking> {
    if (!isCustomerOrderId(orderId)) {
      throw new AppApiError(
        'CUSTOMER_ORDER_INVALID_ID',
        'This order link is invalid.',
      );
    }

    const response = await httpClient.get<unknown>(customerOrderTrackingPath(orderId), {
      signal,
      dedupeKey: `customer-order-tracking:${orderId}`,
    });
    const tracking = parseCustomerOrderTrackingResponse(response);
    if (!tracking || tracking.orderId !== orderId) {
      throw new AppApiError(
        'CUSTOMER_ORDER_TRACKING_INVALID_RESPONSE',
        'Delivery updates could not be verified. Please refresh and try again.',
      );
    }
    return tracking;
  },
};
