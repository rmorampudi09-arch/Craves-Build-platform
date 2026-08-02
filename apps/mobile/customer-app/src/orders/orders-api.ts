import { CRAVES_API_BASE_URL, NETWORK_TIMEOUT_MS } from '../config';
import type { MobileSession } from '../auth/contracts';
import { parseOrder, parseOrders, type CustomerOrder } from './contracts';

export class OrdersApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

async function request(session: MobileSession, path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(`${CRAVES_API_BASE_URL}${path}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}` }, signal: controller.signal });
    if (!response.ok) {
      if (response.status === 401) throw new OrdersApiError('SESSION_EXPIRED', 401, 'Your session expired. Sign in again.');
      if (response.status === 403 || response.status === 404) throw new OrdersApiError('ORDER_NOT_FOUND', response.status, 'This order was not found for your account.');
      throw new OrdersApiError('ORDERS_UNAVAILABLE', response.status, 'Orders are temporarily unavailable.');
    }
    return response.json().catch(() => null);
  } catch (error) {
    if (error instanceof OrdersApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new OrdersApiError('ORDERS_TIMEOUT', 504, 'Order request timed out.');
    throw new OrdersApiError('ORDERS_UNAVAILABLE', 503, 'Check your connection and try again.');
  } finally { clearTimeout(timeout); }
}

export async function listCustomerOrders(session: MobileSession): Promise<CustomerOrder[]> {
  const orders = parseOrders(await request(session, '/orders'));
  if (!orders) throw new OrdersApiError('INVALID_ORDER_RESPONSE', 502, 'Orders are temporarily unavailable.');
  return orders;
}

export async function getCustomerOrder(session: MobileSession, orderId: string): Promise<CustomerOrder> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) throw new OrdersApiError('INVALID_ORDER_ID', 400, 'Order id is invalid.');
  const order = parseOrder(await request(session, `/orders/${encodeURIComponent(orderId)}`));
  if (!order) throw new OrdersApiError('INVALID_ORDER_RESPONSE', 502, 'Order is temporarily unavailable.');
  return order;
}
