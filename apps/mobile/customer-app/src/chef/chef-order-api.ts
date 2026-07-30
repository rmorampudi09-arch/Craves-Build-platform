import { CRAVES_API_BASE_URL, NETWORK_TIMEOUT_MS } from '../config';
import type { MobileSession } from '../auth/contracts';
import { parseMobileChefOrder, parseMobileChefOrders, type MobileChefOrder } from './chef-order-contracts';

export class ChefOrderApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

type Method = 'GET' | 'POST';
async function request(session: MobileSession, path: string, method: Method = 'GET', body?: unknown, headers?: Record<string,string>): Promise<Response> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(`${CRAVES_API_BASE_URL}${path}`, { method, headers: { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    if (response.status === 401) throw new ChefOrderApiError('SESSION_EXPIRED', 401, 'Your session expired. Sign in again.');
    if (response.status === 403 || response.status === 404) throw new ChefOrderApiError('CHEF_ORDER_NOT_FOUND', response.status, 'This order is not available for your chef account.');
    if (response.status === 409) throw new ChefOrderApiError('CHEF_ORDER_CONFLICT', 409, 'The order state changed or the action window is no longer valid.');
    if (!response.ok) throw new ChefOrderApiError('CHEF_ORDER_REQUEST_FAILED', response.status, 'The chef order request could not be completed.');
    return response;
  } catch (error) {
    if (error instanceof ChefOrderApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ChefOrderApiError('CHEF_ORDER_TIMEOUT', 504, 'The chef order request timed out.');
    throw new ChefOrderApiError('CHEF_ORDER_UNAVAILABLE', 503, 'Check your connection and try again.');
  } finally { clearTimeout(timeout); }
}

export async function listChefOrders(session: MobileSession): Promise<MobileChefOrder[]> { const response = await request(session, '/chef/orders'); const orders = parseMobileChefOrders(await response.json().catch(() => null)); if (!orders) throw new ChefOrderApiError('INVALID_CHEF_ORDER_RESPONSE', 502, 'Chef orders are temporarily unavailable.'); return orders; }
export async function getChefOrder(session: MobileSession, orderId: string): Promise<MobileChefOrder> { const response = await request(session, `/chef/orders/${encodeURIComponent(orderId)}`); const order = parseMobileChefOrder(await response.json().catch(() => null)); if (!order) throw new ChefOrderApiError('INVALID_CHEF_ORDER_RESPONSE', 502, 'Chef order is temporarily unavailable.'); return order; }
export async function acceptChefOrder(session: MobileSession, orderId: string, prepTimeMinutes: number, note: string | null): Promise<MobileChefOrder> { const key = `${orderId}:accept:${prepTimeMinutes}`; const response = await request(session, `/chef/orders/${encodeURIComponent(orderId)}/accept`, 'POST', { prepTimeMinutes, note }, { 'X-Correlation-ID': orderId, 'Idempotency-Key': key }); const order = parseMobileChefOrder(await response.json().catch(() => null)); if (!order) throw new ChefOrderApiError('INVALID_CHEF_ORDER_RESPONSE', 502, 'Chef order response was invalid.'); return order; }
export async function rejectChefOrder(session: MobileSession, orderId: string, reason: string | null): Promise<MobileChefOrder> { const response = await request(session, `/chef/orders/${encodeURIComponent(orderId)}/reject`, 'POST', { reason }, { 'X-Correlation-ID': orderId, 'Idempotency-Key': `${orderId}:reject` }); const order = parseMobileChefOrder(await response.json().catch(() => null)); if (!order) throw new ChefOrderApiError('INVALID_CHEF_ORDER_RESPONSE', 502, 'Chef order response was invalid.'); return order; }
export async function readyChefOrder(session: MobileSession, orderId: string): Promise<MobileChefOrder> { const response = await request(session, `/chef/orders/${encodeURIComponent(orderId)}/ready-for-pickup`, 'POST'); const order = parseMobileChefOrder(await response.json().catch(() => null)); if (!order) throw new ChefOrderApiError('INVALID_CHEF_ORDER_RESPONSE', 502, 'Chef order response was invalid.'); return order; }
