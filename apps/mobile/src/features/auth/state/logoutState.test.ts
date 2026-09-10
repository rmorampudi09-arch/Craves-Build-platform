import type {Identity} from '../domain/types';
import {authActions, authReducer} from './authSlice';

const identity: Identity = {
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

describe('logout role-state cleanup', () => {
  it('returns authenticated Chef intent and identity state to the anonymous Customer default', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const chefIntent = authReducer(initial, authActions.roleSelected('CHEF'));
    const authenticated = authReducer(chefIntent, authActions.authenticated(identity));
    const signedOut = authReducer(authenticated, authActions.signedOut());

    expect(signedOut.bootstrapStatus).toBe('anonymous');
    expect(signedOut.selectedRole).toBe('CUSTOMER');
    expect(signedOut.identity).toBeNull();
    expect(signedOut.accountResolution).toBeNull();
    expect(signedOut.lastErrorCode).toBeNull();
  });
});
