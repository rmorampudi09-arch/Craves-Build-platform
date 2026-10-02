import {httpClient} from '../../../core/http/httpClient';
import {AppApiError} from '../../../core/http/apiError';
import {z} from 'zod';
import type {ChefApplication, CustomerProfile} from '../domain/types';

const chefApplicationStateSchema = z.object({
  id: z.string().min(1).nullable(),
  identityId: z.string().min(1),
  status: z.enum(['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED']),
}).refine(application =>
  application.status === 'NOT_SUBMITTED'
    ? application.id === null
    : application.id !== null,
);

function requireChefApplication(response: unknown): ChefApplication {
  if (!chefApplicationStateSchema.safeParse(response).success) {
    throw new AppApiError(
      'CHEF_APPLICATION_INVALID_RESPONSE',
      'We could not load your Chef application. Please try again.',
      502,
      undefined,
      true,
    );
  }
  return response as ChefApplication;
}

export interface CustomerProfileInput {
  firstName: string;
  lastName: string;
  email?: string;
}

export interface ChefApplicationInput {
  email: string;
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export const profileApi = {
  async getCustomerProfile(): Promise<CustomerProfile> {
    return httpClient.get<CustomerProfile>('/api/v1/customer/profile');
  },
  async saveCustomerProfile(input: CustomerProfileInput): Promise<CustomerProfile> {
    return httpClient.put<CustomerProfile>('/api/v1/customer/profile', input);
  },
  async getChefApplication(): Promise<ChefApplication> {
    return requireChefApplication(
      await httpClient.get<unknown>('/api/v1/chef/application'),
    );
  },
  async submitChefApplication(input: ChefApplicationInput): Promise<ChefApplication> {
    return requireChefApplication(
      await httpClient.post<unknown>('/api/v1/chef/application', input),
    );
  },
};
