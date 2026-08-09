import type {ChefKitchenProfile} from '../api/chefProfileApi';
import {
  buildChefKitchenProfileReplacementRequest,
  canEditChefKitchenProfile,
  chefEditProfileFormSchema,
  chefKitchenProfileToFormValues,
  mergeChefEditProfileAddressSelection,
} from './chefEditProfileForm';

const PROFILE: ChefKitchenProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  identityId: '22222222-2222-4222-8222-222222222222',
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

describe('chef edit profile form domain', () => {
  it('hydrates the complete editable draft from the canonical kitchen profile', () => {
    expect(chefKitchenProfileToFormValues(PROFILE)).toEqual({
      kitchenName: 'Anita Home Kitchen',
      displayName: 'Chef Anita',
      description: 'Fresh home-style meals',
      phoneNumber: '+919876543210',
      email: 'chef@example.test',
      addressLine1: '12 Market Road',
      addressLine2: '',
      landmark: 'Near Metro',
      areaName: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
    });
  });

  it('preserves unrelated unsaved fields when an address child selection returns', () => {
    const current = {
      ...chefKitchenProfileToFormValues(PROFILE),
      displayName: 'Chef Anita Rao',
      description: 'Unsaved updated bio',
    };

    expect(
      mergeChefEditProfileAddressSelection(current, {
        addressLine1: '99 Lake View Road',
        city: 'Hyderabad',
        state: 'Telangana',
        postalCode: '500081',
      }),
    ).toEqual(
      expect.objectContaining({
        displayName: 'Chef Anita Rao',
        description: 'Unsaved updated bio',
        addressLine1: '99 Lake View Road',
        city: 'Hyderabad',
        state: 'Telangana',
        postalCode: '500081',
      }),
    );
  });

  it('builds the exact full replacement request and preserves server-owned coordinates and status', () => {
    const request = buildChefKitchenProfileReplacementRequest(
      {
        ...chefKitchenProfileToFormValues(PROFILE),
        kitchenName: '  Anita Kitchen  ',
        displayName: '  Chef Anita Rao  ',
        description: '   ',
        addressLine2: '  Floor 2  ',
      },
      PROFILE,
    );

    expect(request).toEqual({
      kitchenName: 'Anita Kitchen',
      displayName: 'Chef Anita Rao',
      description: null,
      phoneNumber: '+919876543210',
      email: 'chef@example.test',
      addressLine1: '12 Market Road',
      addressLine2: 'Floor 2',
      landmark: 'Near Metro',
      areaName: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
      latitude: 12.9716,
      longitude: 77.5946,
      status: 'ACTIVE',
    });
  });

  it('rejects missing backend-required fields', () => {
    const result = chefEditProfileFormSchema.safeParse({
      ...chefKitchenProfileToFormValues(PROFILE),
      addressLine1: ' ',
    });

    expect(result.success).toBe(false);
  });

  it('keeps suspended kitchens read-only at the form-domain boundary', () => {
    expect(canEditChefKitchenProfile({...PROFILE, status: 'SUSPENDED'})).toBe(false);
    expect(canEditChefKitchenProfile(PROFILE)).toBe(true);
  });
});
