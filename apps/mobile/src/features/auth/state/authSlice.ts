import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import {isOpenStatus} from '../../accountDeletion/domain/deletionModel';
import type {
  AccountResolution,
  AuthRole,
  ChefOnboardingStatus,
  Identity,
} from '../domain/types';

export type BootstrapStatus = 'idle' | 'restoring' | 'anonymous' | 'authenticated' | 'error';

export interface AuthState {
  bootstrapStatus: BootstrapStatus;
  selectedRole: AuthRole;
  identity: Identity | null;
  accountResolution: AccountResolution | null;
  lastErrorCode: string | null;
  /** A fresh sign-in (OTP or email) found an open delete request: ask "Keep it?" once before the app. */
  keepItPending: boolean;
}

const initialState: AuthState = {
  bootstrapStatus: 'idle',
  selectedRole: 'CUSTOMER',
  identity: null,
  accountResolution: null,
  lastErrorCode: null,
  keepItPending: false,
};

/** An open request that has not started erasing: the only kind Keep it? can still save. */
function canStillKeep(pending: Identity['pendingDeletion']) {
  return pending != null && isOpenStatus(pending.status) && pending.status !== 'ERASING';
}

function acceptIdentity(state: AuthState, identity: Identity, keepItPending: boolean) {
  state.bootstrapStatus = 'authenticated';
  state.identity = identity;
  state.accountResolution = null;
  state.lastErrorCode = null;
  state.keepItPending = keepItPending;
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    bootstrapReset(state) {
      state.bootstrapStatus = 'idle';
      state.accountResolution = null;
      state.lastErrorCode = null;
    },
    bootstrapStarted(state) {
      state.bootstrapStatus = 'restoring';
      state.accountResolution = null;
      state.lastErrorCode = null;
    },
    bootstrapAnonymous(state) {
      state.bootstrapStatus = 'anonymous';
      state.identity = null;
      state.accountResolution = null;
    },
    // A restored session: never asks Keep it?.
    authenticated(state, action: PayloadAction<Identity>) {
      acceptIdentity(state, action.payload, false);
    },
    // A sign-in the person just made on the OTP or email screen.
    signedInFresh(state, action: PayloadAction<Identity>) {
      // Once erasing has started there is nothing left to keep.
      acceptIdentity(state, action.payload, canStillKeep(action.payload.pendingDeletion));
    },
    keepItDismissed(state) {
      state.keepItPending = false;
    },
    // A token rotation brings a fresh identity; the role and resolved account stay as they are.
    identityRefreshed(state, action: PayloadAction<Identity>) {
      if (state.bootstrapStatus === 'authenticated') {
        state.identity = action.payload;
        // Only ever true to false: a refresh never starts the question, but it ends it when the request ends.
        if (!canStillKeep(action.payload.pendingDeletion)) {
          state.keepItPending = false;
        }
      }
    },
    accountResolved(
      state,
      action: PayloadAction<{identity: Identity; resolution: AccountResolution}>,
    ) {
      state.identity = action.payload.identity;
      state.accountResolution = action.payload.resolution;
      state.lastErrorCode = null;
    },
    customerProfileCompleted(state) {
      if (
        state.accountResolution?.flow === 'CUSTOMER' &&
        state.accountResolution.onboardingStatus === 'PROFILE_REQUIRED'
      ) {
        state.accountResolution = {
          ...state.accountResolution,
          onboardingStatus: 'READY',
        };
      }
    },
    chefApplicationStatusObserved(state, action: PayloadAction<ChefOnboardingStatus>) {
      if (state.accountResolution?.flow === 'CHEF_ONBOARDING') {
        state.accountResolution = {
          ...state.accountResolution,
          onboardingStatus: action.payload,
        };
      }
    },
    bootstrapFailed(state, action: PayloadAction<string>) {
      state.bootstrapStatus = 'error';
      state.accountResolution = null;
      state.lastErrorCode = action.payload;
    },
    roleSelected(state, action: PayloadAction<AuthRole>) {
      state.selectedRole = action.payload;
      state.accountResolution = null;
    },
    signedOut(state) {
      state.bootstrapStatus = 'anonymous';
      state.selectedRole = initialState.selectedRole;
      state.identity = null;
      state.accountResolution = null;
      state.lastErrorCode = null;
      state.keepItPending = false;
    },
  },
});

export const authActions = authSlice.actions;
export const authReducer = authSlice.reducer;
