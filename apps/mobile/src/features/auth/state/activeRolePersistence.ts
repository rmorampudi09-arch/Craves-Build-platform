import type {Middleware} from '@reduxjs/toolkit';
import {activeRoleStorage} from '../storage/activeRoleStorage';
import {authActions, type AuthState} from './authSlice';

/** Persist only authenticated workspace intent, never login attempts or authority. */
export const activeRolePersistence: Middleware<{}, {auth: AuthState}> = api => next => action => {
  const previous = api.getState().auth;
  const result = next(action);
  const auth = api.getState().auth;
  if (authActions.signedOut.match(action) && previous.identity) {
    void activeRoleStorage.clear(previous.identity.id);
  } else if (
    (authActions.authenticated.match(action) ||
      authActions.roleSelected.match(action) || authActions.accountResolved.match(action)) &&
    auth.bootstrapStatus === 'authenticated' && auth.identity
  ) {
    void activeRoleStorage.write(auth.identity.id, auth.selectedRole);
  }
  return result;
};
