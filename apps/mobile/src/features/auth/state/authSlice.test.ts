import type {Identity} from '../domain/types';
import {authActions, authReducer} from './authSlice';

const chefIdentity: Identity = {
  id: 'identity-1',
  firebaseUid: 'firebase-1',
  phoneNumber: '+919876543210',
  email: 'chef@example.com',
  emailVerified: true,
  displayName: 'Chef',
  status: 'ACTIVE',
  roles: ['CHEF'],
  lastLoginAt: null,
};

describe('auth role selection state', () => {
  it('defaults a new anonymous auth attempt to Customer', () => {
    const state = authReducer(undefined, {type: '@@INIT'});

    expect(state.selectedRole).toBe('CUSTOMER');
  });

  it('updates the shared role immediately when the user selects Chef', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const state = authReducer(initial, authActions.roleSelected('CHEF'));

    expect(state.selectedRole).toBe('CHEF');
  });

  it('keeps the selected role through authentication so root routing uses the current attempt', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const chefAttempt = authReducer(initial, authActions.roleSelected('CHEF'));
    const authenticated = authReducer(chefAttempt, authActions.authenticated(chefIdentity));

    expect(authenticated.selectedRole).toBe('CHEF');
    expect(authenticated.bootstrapStatus).toBe('authenticated');
    expect(authenticated.identity).toEqual(chefIdentity);
  });

  it('allows the current auth attempt to switch back to Customer', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const chefAttempt = authReducer(initial, authActions.roleSelected('CHEF'));
    const customerAttempt = authReducer(chefAttempt, authActions.roleSelected('CUSTOMER'));

    expect(customerAttempt.selectedRole).toBe('CUSTOMER');
  });
});
