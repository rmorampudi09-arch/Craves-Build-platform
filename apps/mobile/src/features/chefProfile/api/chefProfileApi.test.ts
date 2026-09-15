import {parseChefKitchenProfile} from './chefProfileApi';

const KITCHEN_ID = '11111111-1111-4111-8111-111111111111';
const IDENTITY_ID = '22222222-2222-4222-8222-222222222222';

function kitchen(overrides: Record<string, unknown> = {}) {
  return {
    id: KITCHEN_ID,
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
    ...overrides,
  };
}

describe('chefProfileApi parsing', () => {
  it('accepts the exact kitchen profile response shape', () => {
    expect(parseChefKitchenProfile(kitchen())).toEqual(
      expect.objectContaining({
        id: KITCHEN_ID,
        identityId: IDENTITY_ID,
        kitchenName: 'Anita Home Kitchen',
        status: 'ACTIVE',
        latitude: 12.9716,
        longitude: 77.5946,
      }),
    );
  });

  it('accepts numeric-string coordinates emitted by compatible JSON serializers', () => {
    expect(
      parseChefKitchenProfile(
        kitchen({latitude: '12.9716', longitude: '77.5946'}),
      ),
    ).toEqual(expect.objectContaining({latitude: 12.9716, longitude: 77.5946}));
  });

  it('fails closed on an unsupported kitchen status', () => {
    expect(parseChefKitchenProfile(kitchen({status: 'VERIFIED'}))).toBeNull();
  });

  it('fails closed when a required contract field is missing', () => {
    expect(parseChefKitchenProfile(kitchen({city: null}))).toBeNull();
  });
});
