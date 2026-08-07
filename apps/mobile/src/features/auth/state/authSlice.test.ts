import type {AccountResolution, Identity} from '../domain/types';
import {authActions, authReducer} from './authSlice';

const chefIdentity: Identity = {
  id: 'identity-1',
  firebaseUid: 'firebase-1',
  phoneNumber: '+919876543210',
  email: 'chef@example.com',
  emailVerified: true,
  displayName: 'Chef',
  status: 'ACTIVE',
  roles: ['CUSTOMER', 'CHEF'],
  lastLoginAt: null,
};

const chefResolution: AccountResolution = {
  flow: 'CHEF',
  requestedRole: 'CHEF',
  authorizedRole: 'CHEF',
  onboardingStatus: 'APPROVED',
};

const customerProfileRequiredResolution: AccountResolution = {
  flow: 'CUSTOMER',
  requestedRole: 'CUSTOMER',
  authorizedRole: 'CUSTOMER',
  onboardingStatus: 'PROFILE_REQUIRED',
};

describe('auth role selection and account resolution state', () => {
  it('defaults a new anonymous auth attempt to Customer', () => {
    const state = authReducer(undefined, {type: '@@INIT'});

    expect(state.selectedRole).toBe('CUSTOMER');
    expect(state.accountResolution).toBeNull();
  });

  it('updates the shared role immediately when the user selects Chef', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const state = authReducer(initial, authActions.roleSelected('CHEF'));

    expect(state.selectedRole).toBe('CHEF');
  });

  it('keeps the selected role as intent through authentication without treating it as resolved authority', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const chefAttempt = authReducer(initial, authActions.roleSelected('CHEF'));
    const authenticated = authReducer(chefAttempt, authActions.authenticated(chefIdentity));

    expect(authenticated.selectedRole).toBe('CHEF');
    expect(authenticated.bootstrapStatus).toBe('authenticated');
    expect(authenticated.identity).toEqual(chefIdentity);
    expect(authenticated.accountResolution).toBeNull();
  });

  it('stores the authoritative /me identity together with the resolved account flow', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const authenticated = authReducer(initial, authActions.authenticated(chefIdentity));
    const resolved = authReducer(
      authenticated,
      authActions.accountResolved({identity: chefIdentity, resolution: chefResolution}),
    );

    expect(resolved.identity).toEqual(chefIdentity);
    expect(resolved.accountResolution).toEqual(chefResolution);
  });

  it('moves only a server-confirmed customer profile-required resolution to ready', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const resolved = authReducer(
      initial,
      authActions.accountResolved({
        identity: chefIdentity,
        resolution: customerProfileRequiredResolution,
      }),
    );
    const completed = authReducer(resolved, authActions.customerProfileCompleted());

    expect(completed.accountResolution).toEqual({
      ...customerProfileRequiredResolution,
      onboardingStatus: 'READY',
    });
  });

  it('does not let customer profile completion mutate Chef authority', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const resolved = authReducer(
      initial,
      authActions.accountResolved({identity: chefIdentity, resolution: chefResolution}),
    );
    const unchanged = authReducer(resolved, authActions.customerProfileCompleted());

    expect(unchanged.accountResolution).toEqual(chefResolution);
  });

  it('clears a prior resolution when a new authentication result is accepted', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const resolved = authReducer(
      initial,
      authActions.accountResolved({identity: chefIdentity, resolution: chefResolution}),
    );
    const reauthenticated = authReducer(resolved, authActions.authenticated(chefIdentity));

    expect(reauthenticated.accountResolution).toBeNull();
  });

  it('allows the current auth attempt to switch back to Customer', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const chefAttempt = authReducer(initial, authActions.roleSelected('CHEF'));
    const customerAttempt = authReducer(chefAttempt, authActions.roleSelected('CUSTOMER'));

    expect(customerAttempt.selectedRole).toBe('CUSTOMER');
    expect(customerAttempt.accountResolution).toBeNull();
  });

  it('clears authoritative account state on sign out', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const resolved = authReducer(
      initial,
      authActions.accountResolved({identity: chefIdentity, resolution: chefResolution}),
    );
    const signedOut = authReducer(resolved, authActions.signedOut());

    expect(signedOut.bootstrapStatus).toBe('anonymous');
    expect(signedOut.identity).toBeNull();
    expect(signedOut.accountResolution).toBeNull();
  });
});
