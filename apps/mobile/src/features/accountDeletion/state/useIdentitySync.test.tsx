import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Provider} from 'react-redux';
import {configureStore} from '@reduxjs/toolkit';
import {sessionManager} from '../../auth/api/sessionManager';
import type {AccountResolution, AuthTokenResponse, Identity} from '../../auth/domain/types';
import {authActions, authReducer} from '../../auth/state/authSlice';
import {useIdentitySync} from './useIdentitySync';

jest.mock('../../auth/api/sessionManager', () => ({
  sessionManager: {onTokensRotated: jest.fn()},
}));

const identity: Identity = {
  id: 'identity-1',
  firebaseUid: 'firebase-1',
  phoneNumber: '+919876543210',
  email: null,
  emailVerified: false,
  displayName: null,
  status: 'ACTIVE',
  roles: ['CUSTOMER', 'CHEF'],
  lastLoginAt: null,
};

const customerFlow: AccountResolution = {
  flow: 'CUSTOMER',
  requestedRole: 'CUSTOMER',
  authorizedRole: 'CUSTOMER',
  onboardingStatus: 'READY',
};

const chefFlow: AccountResolution = {
  flow: 'CHEF',
  requestedRole: 'CHEF',
  authorizedRole: 'CHEF',
  onboardingStatus: 'APPROVED',
};

const unsubscribe = jest.fn();
let rotated: ((tokens: AuthTokenResponse) => void) | undefined;

function tokensFor(next: Identity): AuthTokenResponse {
  return {
    tokenType: 'Bearer',
    accessToken: 'a',
    expiresIn: 900,
    refreshToken: 'r',
    refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    identity: next,
  };
}

function Probe() {
  useIdentitySync();
  return null;
}

function mount(resolution: AccountResolution) {
  const store = configureStore({reducer: {auth: authReducer}});
  store.dispatch(authActions.authenticated(identity));
  store.dispatch(authActions.accountResolved({identity, resolution}));
  const dispatchSpy = jest.spyOn(store, 'dispatch');
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
  });
  return {store, dispatchSpy, tree};
}

describe('useIdentitySync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rotated = undefined;
    jest.mocked(sessionManager.onTokensRotated).mockImplementation(listener => {
      rotated = listener;
      return unsubscribe;
    });
  });

  it('stores the rotated identity with its pending deletion', () => {
    const {store} = mount(customerFlow);
    const pendingDeletion = {
      requestId: 'req-1',
      scope: 'ALL' as const,
      status: 'SCHEDULED' as const,
      dueAt: '2026-12-01T00:00:00.000Z',
    };

    act(() => rotated?.(tokensFor({...identity, pendingDeletion})));

    expect(store.getState().auth.identity?.pendingDeletion).toEqual(pendingDeletion);
    expect(store.getState().auth.accountResolution).toEqual(customerFlow);
  });

  it('stores an identity with no pendingDeletion as is and fires nothing else', () => {
    const {store, dispatchSpy} = mount(customerFlow);

    act(() => rotated?.(tokensFor(identity)));

    expect(store.getState().auth.identity).toEqual(identity);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith(authActions.identityRefreshed(identity));
  });

  it('moves a customer-mode session to Chef when the identity loses CUSTOMER but keeps CHEF', () => {
    const {store, dispatchSpy} = mount(customerFlow);

    act(() => rotated?.(tokensFor({...identity, roles: ['CHEF']})));

    expect(dispatchSpy).toHaveBeenCalledWith(authActions.roleSelected('CHEF'));
    expect(store.getState().auth.selectedRole).toBe('CHEF');
    expect(store.getState().auth.accountResolution).toBeNull();
  });

  it('leaves a customer-mode session alone when the identity loses both roles', () => {
    const {dispatchSpy} = mount(customerFlow);

    act(() => rotated?.(tokensFor({...identity, roles: []})));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('moves a chef-mode session to Customer when the identity loses CHEF', () => {
    const {store, dispatchSpy} = mount(chefFlow);

    act(() => rotated?.(tokensFor({...identity, roles: ['CUSTOMER']})));

    expect(dispatchSpy).toHaveBeenCalledWith(authActions.roleSelected('CUSTOMER'));
    expect(store.getState().auth.selectedRole).toBe('CUSTOMER');
  });

  it('keeps a chef-mode session when the identity still holds CHEF', () => {
    const {dispatchSpy} = mount(chefFlow);

    act(() => rotated?.(tokensFor(identity)));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('stops listening on unmount', () => {
    const {tree} = mount(customerFlow);

    act(() => tree.unmount());

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
