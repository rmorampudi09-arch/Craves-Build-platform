import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {
  parseCustomerAddress,
  type CustomerAddress,
  type CustomerAddressCreateRequest,
  type CustomerAddressUpdateRequest,
} from '../domain/customerAddressContract';

export const CUSTOMER_ADDRESSES_PATH = '/api/v1/customer/addresses';

export class CustomerAddressesContractError extends Error {
  readonly code = 'invalid-response' as const;

  constructor() {
    super('Customer addresses response did not match the approved contract.');
    this.name = 'CustomerAddressesContractError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function addressArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  for (const key of ['addresses', 'items', 'content', 'data'] as const) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }
  return null;
}

function responseAddress(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) {
    return value;
  }
  return asRecord(record.address) ?? asRecord(record.data) ?? value;
}

function requireAddress(value: unknown): CustomerAddress {
  const address = parseCustomerAddress(responseAddress(value));
  if (!address) {
    throw new CustomerAddressesContractError();
  }
  return address;
}

export function parseCustomerAddressesResponse(value: unknown): CustomerAddress[] {
  const values = addressArray(value);
  if (!values || values.length > 100) {
    throw new CustomerAddressesContractError();
  }
  return values.map(requireAddress).filter(address => address.active);
}

function requireAddressId(addressId: string): void {
  if (!addressId.trim()) {
    throw new AppApiError(
      'CUSTOMER_ADDRESS_INVALID_ID',
      'This saved address could not be identified.',
    );
  }
}

async function updateCustomerAddress(
  addressId: string,
  request: CustomerAddressUpdateRequest,
): Promise<CustomerAddress> {
  requireAddressId(addressId);
  const response = await httpClient.put<unknown>(
    `${CUSTOMER_ADDRESSES_PATH}/${encodeURIComponent(addressId)}`,
    request,
  );
  const updated = requireAddress(response);
  if (updated.id !== addressId) {
    throw new CustomerAddressesContractError();
  }
  return updated;
}

export const customerAddressesApi = {
  async list(signal?: AbortSignal): Promise<CustomerAddress[]> {
    const response = await httpClient.get<unknown>(CUSTOMER_ADDRESSES_PATH, {
      signal,
      dedupeKey: 'customer-addresses:list',
    });
    return parseCustomerAddressesResponse(response);
  },

  async create(request: CustomerAddressCreateRequest): Promise<CustomerAddress> {
    const response = await httpClient.post<unknown>(CUSTOMER_ADDRESSES_PATH, request);
    return requireAddress(response);
  },

  update: updateCustomerAddress,

  async delete(addressId: string): Promise<void> {
    requireAddressId(addressId);
    await httpClient.delete<void>(
      `${CUSTOMER_ADDRESSES_PATH}/${encodeURIComponent(addressId)}`,
    );
  },
};
