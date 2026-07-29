import { CRAVES_API_BASE_URL, NETWORK_TIMEOUT_MS } from '../config';
import type { MobileSession } from '../auth/contracts';
import { parseDeliveryProjection, type DeliveryProjection } from './contracts';

export class DeliveryApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
  }
}

export async function getDeliveryProjection(session: MobileSession, orderId: string): Promise<DeliveryProjection> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new DeliveryApiError('INVALID_ORDER_ID', 400, 'Enter a valid order ID.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(`${CRAVES_API_BASE_URL}/orders/${encodeURIComponent(orderId)}/delivery-status`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.accessToken}`
      },
      signal: controller.signal
    });
    if (!response.ok) {
      if (response.status === 401) throw new DeliveryApiError('SESSION_EXPIRED', 401, 'Your session expired. Sign in again.');
      if (response.status === 403 || response.status === 404) throw new DeliveryApiError('ORDER_NOT_FOUND', response.status, 'This order could not be found for your account.');
      throw new DeliveryApiError('DELIVERY_UNAVAILABLE', response.status, 'Delivery status is temporarily unavailable.');
    }
    const projection = parseDeliveryProjection(await response.json().catch(() => null));
    if (!projection) throw new DeliveryApiError('INVALID_DELIVERY_RESPONSE', 502, 'Delivery status is temporarily unavailable.');
    return projection;
  } catch (error) {
    if (error instanceof DeliveryApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new DeliveryApiError('DELIVERY_TIMEOUT', 504, 'Delivery status request timed out.');
    }
    throw new DeliveryApiError('DELIVERY_UNAVAILABLE', 503, 'Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
}
