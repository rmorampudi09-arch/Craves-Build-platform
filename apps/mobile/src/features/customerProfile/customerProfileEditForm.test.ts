import {AppApiError} from '../../core/http/apiError';
import {fullCustomerProfileFixture} from './fixtures/customerProfileFixtures';
import {
  CUSTOMER_PROFILE_AVATAR_CONTRACT_UNAVAILABLE_REASON,
  applyCustomerProfileSaveSuccess,
  applyCustomerProfileServerFailure,
  createCustomerProfileEditFormState,
  createCustomerProfileSavePlan,
  discardCustomerProfileDraft,
  shouldConfirmCustomerProfileDiscard,
  updateCustomerProfileEditField,
  validateCustomerProfileAvatarSelection,
  validateCustomerProfileDraft,
} from './domain/customerProfileEditForm';

function profile() {
  if (fullCustomerProfileFixture.status !== 'ready') {
    throw new Error('Full customer profile fixture must be ready.');
  }
  return fullCustomerProfileFixture.data.profile;
}

describe('P64 customer profile edit form domain', () => {
  it('prefills the original and draft from the canonical profile', () => {
    const state = createCustomerProfileEditFormState(profile());

    expect(state.original).toEqual({
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha@example.test',
    });
    expect(state.draft).toEqual(state.original);
    expect(shouldConfirmCustomerProfileDiscard(state)).toBe(false);
  });

  it('tracks normalized dirty fields without treating harmless whitespace/case as a change', () => {
    let state = createCustomerProfileEditFormState(profile());
    state = updateCustomerProfileEditField(state, 'firstName', ' Asha ');
    state = updateCustomerProfileEditField(state, 'email', 'ASHA@EXAMPLE.TEST');
    expect(shouldConfirmCustomerProfileDiscard(state)).toBe(false);

    state = updateCustomerProfileEditField(state, 'lastName', 'Raman');
    expect(state.dirtyFields.lastName).toBe(true);
    expect(shouldConfirmCustomerProfileDiscard(state)).toBe(true);
  });

  it('validates required names, storage bounds, and optional email syntax locally', () => {
    expect(
      validateCustomerProfileDraft({
        firstName: ' ',
        lastName: 'x'.repeat(101),
        email: 'not-an-email',
      }),
    ).toEqual({
      firstName: 'Enter your first name.',
      lastName: 'Last name must be 100 characters or fewer.',
      email: 'Enter a valid email address or leave it blank.',
    });
  });

  it('builds the exact full PUT body because the approved backend has no partial profile update contract', () => {
    let state = createCustomerProfileEditFormState(profile());
    state = updateCustomerProfileEditField(state, 'firstName', '  Anika  ');

    expect(createCustomerProfileSavePlan(state)).toEqual({
      status: 'ready',
      dirtyFields: {firstName: true, lastName: false, email: false},
      requestMode: 'full-put',
      request: {
        firstName: 'Anika',
        lastName: 'Rao',
        email: 'asha@example.test',
      },
    });
  });

  it('blocks save when changed input is locally invalid', () => {
    let state = createCustomerProfileEditFormState(profile());
    state = updateCustomerProfileEditField(state, 'email', 'bad');

    expect(createCustomerProfileSavePlan(state)).toMatchObject({
      status: 'invalid',
      fieldErrors: {email: 'Enter a valid email address or leave it blank.'},
    });
  });

  it('maps backend validation details back to whitelisted fields without exposing raw detail text', () => {
    let state = createCustomerProfileEditFormState(profile());
    state = updateCustomerProfileEditField(state, 'email', 'bad');
    const failure = new AppApiError(
      'VALIDATION_FAILED',
      'Request validation failed',
      400,
      undefined,
      false,
      false,
      ['email: must be a well-formed email address'],
    );

    state = applyCustomerProfileServerFailure(state, failure);

    expect(state.fieldErrors).toEqual({
      email: 'Enter a valid email address or leave it blank.',
    });
    expect(state.formError).toBeNull();
  });

  it('discard restores the stable original and successful save adopts the canonical server response', () => {
    let state = createCustomerProfileEditFormState(profile());
    state = updateCustomerProfileEditField(state, 'lastName', 'Raman');
    expect(discardCustomerProfileDraft(state).draft.lastName).toBe('Rao');

    state = updateCustomerProfileEditField(state, 'lastName', 'Raman');
    state = applyCustomerProfileSaveSuccess(state, {
      ...profile(),
      lastName: 'Raman',
      displayName: 'Asha Raman',
      updatedAt: '2026-08-09T00:00:00Z',
    });
    expect(state.original.lastName).toBe('Raman');
    expect(state.draft.lastName).toBe('Raman');
    expect(shouldConfirmCustomerProfileDiscard(state)).toBe(false);
  });

  it('fails closed for avatar validation until an approved upload contract defines format and size limits', () => {
    expect(validateCustomerProfileAvatarSelection()).toEqual({
      status: 'unsupported',
      reason: CUSTOMER_PROFILE_AVATAR_CONTRACT_UNAVAILABLE_REASON,
    });
  });
});
