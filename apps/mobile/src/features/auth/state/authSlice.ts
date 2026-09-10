import {createSlice, PayloadAction} from '@reduxjs/toolkit';
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
}

const initialState: AuthState = {
  bootstrapStatus: 'idle',
  selectedRole: 'CUSTOMER',
  identity: null,
  accountResolution: null,
  lastErrorCode: null,
};

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
    authenticated(state, action: PayloadAction<Identity>) {
      state.bootstrapStatus = 'authenticated';
      state.identity = action.payload;
      state.accountResolution = null;
      state.lastErrorCode = null;
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
    },
  },
});

export const authActions = authSlice.actions;
export const authReducer = authSlice.reducer;
