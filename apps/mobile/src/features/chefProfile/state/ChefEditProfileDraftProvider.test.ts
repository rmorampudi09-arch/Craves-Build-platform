import type {ChefKitchenProfile} from '../api/chefProfileApi';
import {chefKitchenProfileToFormValues} from '../domain/chefEditProfileForm';
import {
  reduceChefEditProfileDraft,
  type ChefEditProfileDraftState,
} from './ChefEditProfileDraftProvider';

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

const EMPTY: ChefEditProfileDraftState = {
  originalProfile: null,
  formDraft: null,
  dirtyState: false,
};

describe('ChefEditProfileDraftProvider reducer', () => {
  it('keeps dirty edits when the same profile session is begun again after a child route', () => {
    const begun = reduceChefEditProfileDraft(EMPTY, {type: 'BEGIN', profile: PROFILE});
    const edited = reduceChefEditProfileDraft(begun, {
      type: 'REPLACE_DRAFT',
      values: {
        ...chefKitchenProfileToFormValues(PROFILE),
        displayName: 'Unsaved Chef Name',
      },
    });
    const resumed = reduceChefEditProfileDraft(edited, {type: 'BEGIN', profile: PROFILE});

    expect(resumed.dirtyState).toBe(true);
    expect(resumed.formDraft?.displayName).toBe('Unsaved Chef Name');
  });

  it('merges returned address selection without dropping other dirty fields', () => {
    const begun = reduceChefEditProfileDraft(EMPTY, {type: 'BEGIN', profile: PROFILE});
    const edited = reduceChefEditProfileDraft(begun, {
      type: 'REPLACE_DRAFT',
      values: {
        ...chefKitchenProfileToFormValues(PROFILE),
        description: 'Unsaved bio',
      },
    });
    const withAddress = reduceChefEditProfileDraft(edited, {
      type: 'APPLY_ADDRESS',
      selection: {city: 'Hyderabad', state: 'Telangana'},
    });

    expect(withAddress.formDraft).toEqual(
      expect.objectContaining({
        description: 'Unsaved bio',
        city: 'Hyderabad',
        state: 'Telangana',
      }),
    );
    expect(withAddress.dirtyState).toBe(true);
  });

  it('commits canonical server data and clears dirty state after save', () => {
    const committed = reduceChefEditProfileDraft(
      {
        originalProfile: PROFILE,
        formDraft: {
          ...chefKitchenProfileToFormValues(PROFILE),
          displayName: 'Unsaved Chef Name',
        },
        dirtyState: true,
      },
      {
        type: 'COMMIT',
        profile: {...PROFILE, displayName: 'Saved Chef Name'},
      },
    );

    expect(committed.dirtyState).toBe(false);
    expect(committed.originalProfile?.displayName).toBe('Saved Chef Name');
    expect(committed.formDraft?.displayName).toBe('Saved Chef Name');
  });
});
