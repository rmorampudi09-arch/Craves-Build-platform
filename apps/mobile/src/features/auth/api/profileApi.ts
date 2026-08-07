import {httpClient} from '../../../core/http/httpClient';
import type {ChefApplication, CustomerProfile} from '../domain/types';

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
    return httpClient.get<ChefApplication>('/api/v1/chef/application');
  },
  async submitChefApplication(input: ChefApplicationInput): Promise<ChefApplication> {
    return httpClient.post<ChefApplication>('/api/v1/chef/application', input);
  },
};
