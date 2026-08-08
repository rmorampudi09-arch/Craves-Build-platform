import {httpClient} from '../../../core/http/httpClient';
import {
  parseCustomerProfileHubContract,
  type CustomerProfileHubContract,
} from '../domain/customerProfileContract';

export const CUSTOMER_PROFILE_PATH = '/api/v1/customer/profile';

export class CustomerProfileContractError extends Error {
  readonly code = 'invalid-response' as const;

  constructor() {
    super('Customer profile response did not match the approved contract.');
    this.name = 'CustomerProfileContractError';
  }
}

export function parseCustomerProfileResponse(
  value: unknown,
): CustomerProfileHubContract | null {
  if (value == null) {
    return null;
  }

  const profile = parseCustomerProfileHubContract(value);
  if (!profile) {
    throw new CustomerProfileContractError();
  }
  return profile;
}

export const customerProfileApi = {
  async getProfile(signal?: AbortSignal): Promise<CustomerProfileHubContract | null> {
    const response = await httpClient.get<unknown>(CUSTOMER_PROFILE_PATH, {
      signal,
      dedupeKey: 'customer-profile:summary',
    });
    return parseCustomerProfileResponse(response);
  },
};
