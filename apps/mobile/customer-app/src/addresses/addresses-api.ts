import { CRAVES_API_BASE_URL, NETWORK_TIMEOUT_MS } from '../config';
import type { MobileSession } from '../auth/contracts';
import {
  parseAddress,
  parseAddresses,
  parseAddressInput,
  parseRecommendation,
  type AddressInput,
  type CustomerAddress,
  type LocationRecommendation
} from './contracts';

export class AddressesApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function request(session: MobileSession, path: string, method: Method = 'GET', body?: unknown): Promise<Response> {
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
    if (response.status === 401) throw new AddressesApiError('SESSION_EXPIRED', 401, 'Your session expired. Sign in again.');
    if (response.status === 404) throw new AddressesApiError('ADDRESS_NOT_FOUND', 404, 'The saved address was not found.');
    if (!response.ok) throw new AddressesApiError('ADDRESS_REQUEST_FAILED', response.status, 'The address request could not be completed.');
    return response;
  } catch (error) {
    if (error instanceof AddressesApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new AddressesApiError('ADDRESS_TIMEOUT', 504, 'The address request timed out.');
    throw new AddressesApiError('ADDRESS_UNAVAILABLE', 503, 'Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function listAddresses(session: MobileSession): Promise<CustomerAddress[]> {
  const response = await request(session, '/customer/addresses');
  const addresses = parseAddresses(await response.json().catch(() => null));
  if (!addresses) throw new AddressesApiError('INVALID_ADDRESS_RESPONSE', 502, 'Saved addresses are temporarily unavailable.');
  return addresses;
}

export async function getAddress(session: MobileSession, addressId: string): Promise<CustomerAddress> {
  assertUuid(addressId);
  const response = await request(session, `/customer/addresses/${encodeURIComponent(addressId)}`);
  const address = parseAddress(await response.json().catch(() => null));
  if (!address) throw new AddressesApiError('INVALID_ADDRESS_RESPONSE', 502, 'The saved address is temporarily unavailable.');
  return address;
}

export async function createAddress(session: MobileSession, input: AddressInput): Promise<CustomerAddress> {
  const valid = parseAddressInput(input);
  if (!valid) throw new AddressesApiError('INVALID_ADDRESS', 400, 'Enter a complete valid address and coordinates.');
  const response = await request(session, '/customer/addresses', 'POST', valid);
  const address = parseAddress(await response.json().catch(() => null));
  if (!address) throw new AddressesApiError('INVALID_ADDRESS_RESPONSE', 502, 'The saved address response was invalid.');
  return address;
}

export async function updateAddress(session: MobileSession, addressId: string, input: AddressInput): Promise<CustomerAddress> {
  assertUuid(addressId);
  const valid = parseAddressInput(input);
  if (!valid) throw new AddressesApiError('INVALID_ADDRESS', 400, 'Enter a complete valid address and coordinates.');
  const response = await request(session, `/customer/addresses/${encodeURIComponent(addressId)}`, 'PUT', valid);
  const address = parseAddress(await response.json().catch(() => null));
  if (!address) throw new AddressesApiError('INVALID_ADDRESS_RESPONSE', 502, 'The saved address response was invalid.');
  return address;
}

export async function deleteAddress(session: MobileSession, addressId: string): Promise<void> {
  assertUuid(addressId);
  await request(session, `/customer/addresses/${encodeURIComponent(addressId)}`, 'DELETE');
}

export async function recommendLocation(
  session: MobileSession,
  latitude: number,
  longitude: number,
  matchRadiusMeters = 100
): Promise<LocationRecommendation> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isInteger(matchRadiusMeters) || matchRadiusMeters < 1 || matchRadiusMeters > 100_000) {
    throw new AddressesApiError('INVALID_LOCATION', 400, 'Enter valid map coordinates.');
  }
  const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), matchRadiusMeters: String(matchRadiusMeters) });
  const response = await request(session, `/customer/addresses/recommendation?${query}`);
  const recommendation = parseRecommendation(await response.json().catch(() => null));
  if (!recommendation) throw new AddressesApiError('INVALID_RECOMMENDATION_RESPONSE', 502, 'Location recommendation is temporarily unavailable.');
  return recommendation;
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AddressesApiError('INVALID_ADDRESS_ID', 400, 'Address id is invalid.');
  }
}
