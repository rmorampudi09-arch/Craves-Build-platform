import {AppApiError} from '../../../core/http/apiError';
import type {ChefApplication} from './types';
import {
  chefApplicationToDraft,
  mapChefApplicationSubmissionFailure,
  normalizeChefApplicationInput,
} from './chefApplicationOnboarding';

const rejectedApplication: ChefApplication = {
  id: 'application-1',
  identityId: 'identity-1',
  phoneNumber: '+919876543210',
  email: 'Chef@Example.com',
  firstName: 'Asha',
  lastName: 'Rao',
  addressLine1: '12 Market Road',
  addressLine2: null,
  landmark: 'Near Park',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500001',
  latitude: null,
  longitude: null,
  status: 'REJECTED',
  rejectionReason: 'Please correct the address details.',
  submittedAt: '2026-08-08T00:00:00Z',
  reviewedAt: '2026-08-08T01:00:00Z',
  reviewedByIdentityId: 'reviewer-1',
  documents: [],
};

describe('P23 Chef application onboarding domain', () => {
  it('normalizes the exact application payload and omits blank optional strings', () => {
    expect(
      normalizeChefApplicationInput({
        email: ' CHEF@Example.com ',
        firstName: ' Asha ',
        lastName: ' Rao ',
        addressLine1: ' 12 Market Road ',
        addressLine2: ' ',
        landmark: ' Near Park ',
        city: ' Hyderabad ',
        state: ' Telangana ',
        postalCode: '',
      }),
    ).toEqual({
      email: 'chef@example.com',
      firstName: 'Asha',
      lastName: 'Rao',
      addressLine1: '12 Market Road',
      landmark: 'Near Park',
      city: 'Hyderabad',
      state: 'Telangana',
    });
  });

  it('prefills a rejected application without inventing missing values', () => {
    expect(chefApplicationToDraft(rejectedApplication)).toEqual({
      email: 'Chef@Example.com',
      firstName: 'Asha',
      lastName: 'Rao',
      addressLine1: '12 Market Road',
      addressLine2: '',
      landmark: 'Near Park',
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500001',
    });
  });

  it('maps only known backend validation fields to safe field errors', () => {
    const failure = mapChefApplicationSubmissionFailure(
      new AppApiError(
        'VALIDATION_FAILED',
        'Request validation failed',
        400,
        undefined,
        false,
        false,
        ['email: must be a well-formed email address', 'serverInternalField: invalid'],
      ),
    );

    expect(failure.fieldErrors).toEqual({email: 'Enter a valid email address.'});
    expect(failure.error.code).toBe('VALIDATION_FAILED');
  });
});
