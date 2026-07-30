import { CRAVES_API_BASE_URL, NETWORK_TIMEOUT_MS } from '../config';
import type { MobileSession } from '../auth/contracts';
import { parseCart, validateMenuItemInput, validateQuantity, type CustomerCart } from './contracts';

export class CartApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function request(session: MobileSession, path: string, method: Method = 'GET', body?: unknown): Promise<CustomerCart> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(`${CRAVES_API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    if (response.status === 401) throw new CartApiError('SESSION_EXPIRED', 401, 'Your session expired. Sign in again.');
    if (response.status === 404) throw new CartApiError('CART_ITEM_NOT_FOUND', 404, 'The cart item was not found.');
    if (!response.ok) throw new CartApiError('CART_REQUEST_FAILED', response.status, 'The cart could not be updated.');
    const cart = parseCart(await response.json().catch(() => null));
    if (!cart) throw new CartApiError('INVALID_CART_RESPONSE', 502, 'Your cart is temporarily unavailable.');
    return cart;
  } catch (error) {
    if (error instanceof CartApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new CartApiError('CART_TIMEOUT', 504, 'The cart request timed out.');
    throw new CartApiError('CART_UNAVAILABLE', 503, 'Check your connection and try again.');
  } finally { clearTimeout(timeout); }
}

export function getCart(session: MobileSession): Promise<CustomerCart> { return request(session, '/cart'); }
export function clearCart(session: MobileSession): Promise<CustomerCart> { return request(session, '/cart', 'DELETE'); }
export function validateCart(session: MobileSession): Promise<CustomerCart> { return request(session, '/cart/validate', 'POST'); }

export function addCartItem(session: MobileSession, menuItemId: string, quantity = 1): Promise<CustomerCart> {
  if (!validateMenuItemInput(menuItemId, quantity)) throw new CartApiError('INVALID_CART_ITEM', 400, 'The selected menu item or quantity is invalid.');
  return request(session, '/cart/items', 'POST', { menuItemId, quantity });
}

export function updateCartItem(session: MobileSession, cartItemId: string, quantity: number): Promise<CustomerCart> {
  assertUuid(cartItemId);
  if (!validateQuantity(quantity)) throw new CartApiError('INVALID_QUANTITY', 400, 'Quantity must be between 1 and 100.');
  return request(session, `/cart/items/${encodeURIComponent(cartItemId)}`, 'PUT', { quantity });
}

export function removeCartItem(session: MobileSession, cartItemId: string): Promise<CustomerCart> {
  assertUuid(cartItemId);
  return request(session, `/cart/items/${encodeURIComponent(cartItemId)}`, 'DELETE');
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new CartApiError('INVALID_CART_ITEM_ID', 400, 'Cart item id is invalid.');
}
