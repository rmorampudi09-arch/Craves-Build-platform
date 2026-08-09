import {QueryClient} from '@tanstack/react-query';
import type {ChefKitchenProfile} from '../api/chefProfileApi';
import {createChefProfileKitchenQueryKey} from './chefProfileQuery';
import {synchronizeChefProfileAfterSave} from './chefProfileSynchronization';

const IDENTITY_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE: ChefKitchenProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  identityId: IDENTITY_ID,
  kitchenName: 'Anita Home Kitchen',
  displayName: 'Chef Anita',
  description: 'Fresh home-style meals',
  phoneNumber: '+919876543210',
  email: 'chef@example.test',
  addressLine1: '12 Market Road',
  addressLine2: null,
  landmark: 'Near Metro',
  areaName: 'Indiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560038',
  latitude: 12.9716,
  longitude: 77.5946,
  status: 'ACTIVE',
  createdAt: '2026-08-01T07:00:00Z',
  updatedAt: '2026-08-09T08:00:00Z',
};

describe('chef profile synchronization', () => {
  it('updates the canonical Chef identity cache immediately and marks it stale', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {queries: {retry: false}},
    });
    const queryKey = createChefProfileKitchenQueryKey(IDENTITY_ID);
    queryClient.setQueryData(queryKey, {...PROFILE, displayName: 'Old Name'});

    await synchronizeChefProfileAfterSave(queryClient, IDENTITY_ID, PROFILE);

    expect(queryClient.getQueryData(queryKey)).toEqual(PROFILE);
    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
    queryClient.clear();
  });
});
