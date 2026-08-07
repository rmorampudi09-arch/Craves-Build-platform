import {apiClient} from '../../../core/http/apiClient';
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
    const response = await apiClient.get<CustomerProfile>('/api/v1/customer/profile');
    return response.data;
  },
  async saveCustomerProfile(input: CustomerProfileInput): Promise<CustomerProfile> {
    const response = await apiClient.put<CustomerProfile>('/api/v1/customer/profile', input);
    return response.data;
  },
  async getChefApplication(): Promise<ChefApplication> {
    const response = await apiClient.get<ChefApplication>('/api/v1/chef/application');
    return response.data;
  },
  async submitChefApplication(input: ChefApplicationInput): Promise<ChefApplication> {
    const response = await apiClient.post<ChefApplication>('/api/v1/chef/application', input);
    return response.data;
  },
};
