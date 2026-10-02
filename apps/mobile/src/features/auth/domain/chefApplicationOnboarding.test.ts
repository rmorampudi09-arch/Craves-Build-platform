import {AppApiError} from '../../../core/http/apiError';
import type {ChefApplication} from './types';
import {
  applyDetectedChefAddress,
  chefApplicationToDraft,
  mapChefApplicationSubmissionFailure,
  normalizeChefApplicationInput,
  validChefApplicationCoordinates,
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
  it('includes valid selected coordinates in the existing submission contract', () => {
    expect(normalizeChefApplicationInput(
      chefApplicationToDraft(rejectedApplication),
      {latitude: 17.385, longitude: 78.4867},
    )).toMatchObject({latitude: 17.385, longitude: 78.4867});
  });

  it.each([
    {latitude: null, longitude: 78},
    {latitude: 17, longitude: null},
    {latitude: Number.NaN, longitude: 78},
    {latitude: 91, longitude: 78},
    {latitude: 17, longitude: -181},
    {latitude: 17, longitude: Number.POSITIVE_INFINITY},
  ])('does not accept invalid or incomplete location coordinates: %p', location => {
    expect(validChefApplicationCoordinates(location)).toBeNull();
  });

  it('accepts zero coordinates without inventing a default location', () => {
    expect(validChefApplicationCoordinates({latitude: 0, longitude: 0}))
      .toEqual({latitude: 0, longitude: 0});
  });

  it('fills only detected address fields while preserving applicant and house details', () => {
    const draft = {...chefApplicationToDraft(rejectedApplication), addressLine2: 'Flat 2'};
    expect(applyDetectedChefAddress(draft, {
      formattedAddress: '14, Lake Road, Hyderabad', houseNumber: '14', street: 'Lake Road',
      area: 'Central', city: 'Hyderabad', district: 'Hyderabad', state: 'Telangana',
      postalCode: '500002', country: 'India', confidence: 'High', preciseHouseNumber: true,
    })).toEqual({...draft, addressLine1: '14, Lake Road', postalCode: '500002'});
  });

  it('keeps manual city/state/pincode when lookup cannot determine them', () => {
    const draft = chefApplicationToDraft(rejectedApplication);
    expect(applyDetectedChefAddress(draft, {
      formattedAddress: 'Lake Road', houseNumber: null, street: null, area: null,
      city: null, district: null, state: null, postalCode: null, country: null,
      confidence: 'Low', preciseHouseNumber: false,
    })).toEqual({...draft, addressLine1: 'Lake Road'});
  });

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

  it('maps the Auth verification requirement to the Chef email field', () => {
    const failure = mapChefApplicationSubmissionFailure(
      new AppApiError(
        'EMAIL_VERIFICATION_REQUIRED',
        'Verify this email before continuing',
        409,
      ),
    );

    expect(failure.fieldErrors).toEqual({
      email: 'Verify this email before submitting your Chef application.',
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
