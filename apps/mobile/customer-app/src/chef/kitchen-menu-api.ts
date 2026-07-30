import { CRAVES_API_BASE_URL, NETWORK_TIMEOUT_MS } from '../config';
import type { MobileSession } from '../auth/contracts';
import { parseMobileChefKitchen, parseMobileChefMenuItem, parseMobileChefMenuItems, type MobileChefKitchen, type MobileChefMenuItem } from './kitchen-menu-contracts';

export class ChefCatalogApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH';
async function request(session: MobileSession, path: string, method: Method = 'GET', body?: unknown, allowNotFound = false): Promise<Response> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(`${CRAVES_API_BASE_URL}${path}`, { method, headers: { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    if (response.status === 401) throw new ChefCatalogApiError('SESSION_EXPIRED', 401, 'Your session expired. Sign in again.');
    if (response.status === 403) throw new ChefCatalogApiError('CHEF_ACCESS_REQUIRED', 403, 'An approved chef role is required.');
    if (allowNotFound && response.status === 404) return response;
    if (!response.ok) throw new ChefCatalogApiError('CHEF_CATALOG_REQUEST_FAILED', response.status, 'The chef catalog request could not be completed.');
    return response;
  } catch (error) {
    if (error instanceof ChefCatalogApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ChefCatalogApiError('CHEF_CATALOG_TIMEOUT', 504, 'The chef catalog request timed out.');
    throw new ChefCatalogApiError('CHEF_CATALOG_UNAVAILABLE', 503, 'Check your connection and try again.');
  } finally { clearTimeout(timeout); }
}

export async function getMyKitchen(session: MobileSession): Promise<MobileChefKitchen | null> {
  const response = await request(session, '/kitchens/me', 'GET', undefined, true);
  if (response.status === 404) return null;
  const kitchen = parseMobileChefKitchen(await response.json().catch(() => null));
  if (!kitchen) throw new ChefCatalogApiError('INVALID_KITCHEN_RESPONSE', 502, 'Kitchen profile is temporarily unavailable.');
  return kitchen;
}

export async function saveMyKitchen(session: MobileSession, input: Omit<MobileChefKitchen, 'id' | 'status'> & { status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' }): Promise<MobileChefKitchen> {
  const response = await request(session, '/kitchens/me', 'PUT', input);
  const kitchen = parseMobileChefKitchen(await response.json().catch(() => null));
  if (!kitchen) throw new ChefCatalogApiError('INVALID_KITCHEN_RESPONSE', 502, 'Kitchen profile response was invalid.');
  return kitchen;
}

export async function listMyMenu(session: MobileSession): Promise<MobileChefMenuItem[]> {
  const response = await request(session, '/kitchens/me/menu-items');
  const items = parseMobileChefMenuItems(await response.json().catch(() => null));
  if (!items) throw new ChefCatalogApiError('INVALID_MENU_RESPONSE', 502, 'Menu is temporarily unavailable.');
  return items;
}

export async function saveMenuItem(session: MobileSession, input: Omit<MobileChefMenuItem, 'id'>, menuItemId?: string): Promise<MobileChefMenuItem> {
  const response = await request(session, menuItemId ? `/kitchens/me/menu-items/${encodeURIComponent(menuItemId)}` : '/kitchens/me/menu-items', menuItemId ? 'PUT' : 'POST', input);
  const item = parseMobileChefMenuItem(await response.json().catch(() => null));
  if (!item) throw new ChefCatalogApiError('INVALID_MENU_RESPONSE', 502, 'Menu item response was invalid.');
  return item;
}

export async function setMenuAvailability(session: MobileSession, menuItemId: string, available: boolean): Promise<MobileChefMenuItem> {
  const response = await request(session, `/kitchens/me/menu-items/${encodeURIComponent(menuItemId)}/availability`, 'PATCH', { available, reason: null });
  const item = parseMobileChefMenuItem(await response.json().catch(() => null));
  if (!item) throw new ChefCatalogApiError('INVALID_MENU_RESPONSE', 502, 'Menu availability response was invalid.');
  return item;
}
