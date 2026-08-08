import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {
  parseCustomerAddress,
  toCustomerAddressUpdateRequest,
  type CustomerAddress,
} from '../domain/customerAddressContract';

export const CUSTOMER_ADDRESSES_PATH = '/api/v1/customer/addresses';

export class CustomerAddressesContractError extends Error {
  readonly code = 'invalid-response' as const;

  constructor() {
    super('Customer addresses response did not match the approved contract.');
    this.name = 'CustomerAddressesContractError';
  }
}

function requireAddress(value: unknown): CustomerAddress {
  const address = parseCustomerAddress(value);
  if (!address) {
    throw new CustomerAddressesContractError();
  }
  return address;
}

export function parseCustomerAddressesResponse(value: unknown): CustomerAddress[] {
  if (!Array.isArray(value)) {
    throw new CustomerAddressesContractError();
  }

  return value.map(requireAddress).filter(address => address.active);
}

function requireAddressId(addressId: string): void {
  if (!addressId.trim()) {
    throw new AppApiError(
      'CUSTOMER_ADDRESS_INVALID_ID',
      'This saved address could not be identified.',
    );
  }
}

export const customerAddressesApi = {
  async list(signal?: AbortSignal): Promise<CustomerAddress[]> {
    const response = await httpClient.get<unknown>(CUSTOMER_ADDRESSES_PATH, {
      signal,
      dedupeKey: 'customer-addresses:list',
    });
    return parseCustomerAddressesResponse(response);
  },

  async setDefault(address: CustomerAddress): Promise<CustomerAddress> {
    requireAddressId(address.id);
    const response = await httpClient.put<unknown>(
      `${CUSTOMER_ADDRESSES_PATH}/${encodeURIComponent(address.id)}`,
      toCustomerAddressUpdateRequest(address, true),
    );
    const updated = requireAddress(response);
    if (updated.id !== address.id) {
      throw new CustomerAddressesContractError();
    }
    return updated;
  },

  async delete(addressId: string): Promise<void> {
    requireAddressId(addressId);
    await httpClient.delete<void>(
      `${CUSTOMER_ADDRESSES_PATH}/${encodeURIComponent(addressId)}`,
    );
  },
};
