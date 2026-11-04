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

const chefPendingResolution: AccountResolution = {
  flow: 'CHEF_ONBOARDING',
  requestedRole: 'CHEF',
  authorizedRole: 'CUSTOMER',
  onboardingStatus: 'PENDING',
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

  it('updates only a Chef onboarding resolution from an observed backend application status', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const resolved = authReducer(
      initial,
      authActions.accountResolved({
        identity: chefIdentity,
        resolution: chefPendingResolution,
      }),
    );
    const rejected = authReducer(
      resolved,
      authActions.chefApplicationStatusObserved('REJECTED'),
    );

    expect(rejected.accountResolution).toEqual({
      ...chefPendingResolution,
      onboardingStatus: 'REJECTED',
    });
  });

  it('does not let a Chef onboarding status observation alter approved Chef authority', () => {
    const initial = authReducer(undefined, {type: '@@INIT'});
    const resolved = authReducer(
      initial,
      authActions.accountResolved({identity: chefIdentity, resolution: chefResolution}),
    );
    const unchanged = authReducer(
      resolved,
      authActions.chefApplicationStatusObserved('REJECTED'),
    );

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

  it('refreshes the identity without touching the role or the resolved account', () => {
    const resolved = authReducer(
      authReducer(undefined, authActions.authenticated(chefIdentity)),
      authActions.accountResolved({identity: chefIdentity, resolution: chefResolution}),
    );
    const refreshed = {
      ...chefIdentity,
      pendingDeletion: {
        requestId: 'req-1',
        scope: 'ALL' as const,
        status: 'SCHEDULED' as const,
        dueAt: null,
      },
    };

    const state = authReducer(resolved, authActions.identityRefreshed(refreshed));

    expect(state.identity).toEqual(refreshed);
    expect(state.accountResolution).toEqual(chefResolution);
    expect(state.selectedRole).toBe(resolved.selectedRole);
    expect(state.bootstrapStatus).toBe('authenticated');
  });

  describe('Keep it? after a fresh sign-in', () => {
    const withRequest = (status: 'PENDING_REVIEW' | 'SCHEDULED' | 'WAITING_ON_OPEN_ITEMS' | 'ERASING' | 'CANCELLED') => ({
      ...chefIdentity,
      pendingDeletion: {requestId: 'req-1', scope: 'ALL' as const, status, dueAt: '2026-12-05T12:00:00Z'},
    });

    it.each(['PENDING_REVIEW', 'SCHEDULED', 'WAITING_ON_OPEN_ITEMS'] as const)(
      'asks after a sign-in with a %s request, and signs in as authenticated does',
      status => {
        const state = authReducer(undefined, authActions.signedInFresh(withRequest(status)));

        expect(state.keepItPending).toBe(true);
        expect(state.bootstrapStatus).toBe('authenticated');
        expect(state.identity).toEqual(withRequest(status));
        expect(state.accountResolution).toBeNull();
        expect(state.lastErrorCode).toBeNull();
      },
    );

    it('does not ask once erasing has started, after an ended request, or without one', () => {
      for (const identity of [
        withRequest('ERASING'),
        withRequest('CANCELLED'),
        {...chefIdentity, pendingDeletion: null},
        chefIdentity,
      ]) {
        expect(authReducer(undefined, authActions.signedInFresh(identity)).keepItPending).toBe(false);
      }
    });

    it('never asks when the app restores a saved session', () => {
      const asked = authReducer(undefined, authActions.signedInFresh(withRequest('SCHEDULED')));

      expect(authReducer(undefined, authActions.authenticated(withRequest('SCHEDULED'))).keepItPending).toBe(false);
      expect(authReducer(asked, authActions.authenticated(withRequest('SCHEDULED'))).keepItPending).toBe(false);
    });

    it('stops asking after an answer or a sign out', () => {
      const asked = authReducer(undefined, authActions.signedInFresh(withRequest('SCHEDULED')));

      expect(authReducer(asked, authActions.keepItDismissed()).keepItPending).toBe(false);
      expect(authReducer(asked, authActions.signedOut()).keepItPending).toBe(false);
    });
  });

  describe('keepItPending on a refreshed identity', () => {
    const request = (status: 'SCHEDULED' | 'ERASING' | 'CANCELLED') => ({
      ...chefIdentity,
      pendingDeletion: {requestId: 'req-1', scope: 'ALL' as const, status, dueAt: '2026-12-05T12:00:00Z'},
    });
    const asked = () => authReducer(undefined, authActions.signedInFresh(request('SCHEDULED')));

    it.each([
      ['the request has ended', request('CANCELLED')],
      ['there is no request', {...chefIdentity, pendingDeletion: null}],
      ['erasing has started', request('ERASING')],
    ])('stops asking when %s', (_name, refreshed) => {
      expect(authReducer(asked(), authActions.identityRefreshed(refreshed)).keepItPending).toBe(false);
    });

    it('keeps asking while the request is still open', () => {
      expect(authReducer(asked(), authActions.identityRefreshed(request('SCHEDULED'))).keepItPending).toBe(true);
    });

    it('never starts asking from a refresh', () => {
      const restored = authReducer(undefined, authActions.authenticated(chefIdentity));
      expect(authReducer(restored, authActions.identityRefreshed(request('SCHEDULED'))).keepItPending).toBe(false);
    });
  });

  it('ignores a refreshed identity while nobody is signed in', () => {
    const anonymous = authReducer(undefined, authActions.bootstrapAnonymous());

    const state = authReducer(anonymous, authActions.identityRefreshed(chefIdentity));

    expect(state.identity).toBeNull();
    expect(state.bootstrapStatus).toBe('anonymous');
  });
});
