import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Provider} from 'react-redux';
import {configureStore} from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useBootstrap} from '../hooks/useBootstrap';
import {authService} from './authService';
import {authActions, authReducer} from './authSlice';
import {activeRolePersistence} from './activeRolePersistence';
import {activeRoleStorage} from '../storage/activeRoleStorage';
import type {Identity} from '../domain/types';

jest.mock('./authService', () => ({authService: {restore: jest.fn()}}));

const identity: Identity = {
  id: 'test-customer-chef', firebaseUid: 'test-firebase', phoneNumber: '',
  email: null, emailVerified: false, displayName: null, status: 'ACTIVE',
  roles: ['CUSTOMER', 'CHEF'], lastLoginAt: null,
};
const values = new Map<string, string>();
const makeStore = () => configureStore({
  reducer: {auth: authReducer},
  middleware: getDefaultMiddleware => getDefaultMiddleware().concat(activeRolePersistence),
});
function BootstrapProbe() { useBootstrap(); return null; }

describe('authenticated workspace restoration', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    values.clear();
    jest.mocked(AsyncStorage.getItem).mockImplementation(async key => values.get(key) ?? null);
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { values.set(key, value); });
    jest.mocked(AsyncStorage.removeItem).mockImplementation(async key => { values.delete(key); });
  });
  afterEach(async () => {
    act(() => tree?.unmount());
    await activeRoleStorage.read(identity.id);
  });

  it.each(['CHEF', 'CUSTOMER'] as const)('restores %s before exposing the authenticated account router', async role => {
    const oldStore = makeStore();
    oldStore.dispatch(authActions.authenticated(identity));
    oldStore.dispatch(authActions.roleSelected(role));
    await activeRoleStorage.read(identity.id);
    jest.mocked(authService.restore).mockResolvedValue({identity} as Awaited<ReturnType<typeof authService.restore>>);
    const reopened = makeStore();
    const observed: string[] = [];
    reopened.subscribe(() => {
      if (reopened.getState().auth.bootstrapStatus === 'authenticated') {
        observed.push(reopened.getState().auth.selectedRole);
      }
    });
    await act(async () => { tree = renderer.create(<Provider store={reopened}><BootstrapProbe /></Provider>); });
    expect(observed).toEqual([role]);
    expect(reopened.getState().auth.accountResolution).toBeNull();
  });

  it('does not persist unauthenticated login intent or share roles between identities', async () => {
    const state = makeStore();
    state.dispatch(authActions.roleSelected('CHEF'));
    expect(await activeRoleStorage.read(identity.id)).toBeNull();
    state.dispatch(authActions.authenticated(identity));
    state.dispatch(authActions.roleSelected('CHEF'));
    expect(await activeRoleStorage.read(identity.id)).toBe('CHEF');
    expect(await activeRoleStorage.read('another-account')).toBeNull();
    state.dispatch(authActions.signedOut());
    expect(await activeRoleStorage.read(identity.id)).toBeNull();
  });

  it('serializes fast switches and ignores invalid or unavailable storage', async () => {
    void activeRoleStorage.write(identity.id, 'CHEF');
    void activeRoleStorage.write(identity.id, 'CUSTOMER');
    expect(await activeRoleStorage.read(identity.id)).toBe('CUSTOMER');
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('ADMIN');
    expect(await activeRoleStorage.read(identity.id)).toBeNull();
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('Storage unavailable'));
    expect(await activeRoleStorage.read(identity.id)).toBeNull();
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(activeRoleStorage.write(identity.id, 'CHEF')).resolves.toBeUndefined();
  });
});
