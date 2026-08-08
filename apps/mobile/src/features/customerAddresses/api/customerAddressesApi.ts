import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {
  parseCustomerAddress,
  toCustomerAddressUpdateRequest,
  type CustomerAddress,
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

  update: updateCustomerAddress,

  async setDefault(address: CustomerAddress): Promise<CustomerAddress> {
    return updateCustomerAddress(
      address.id,
      toCustomerAddressUpdateRequest(address, true),
    );
  },

  async delete(addressId: string): Promise<void> {
    requireAddressId(addressId);
    await httpClient.delete<void>(
      `${CUSTOMER_ADDRESSES_PATH}/${encodeURIComponent(addressId)}`,
    );
  },
};
