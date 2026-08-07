import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import type {AuthRole, Identity} from '../domain/types';

export type BootstrapStatus = 'idle' | 'restoring' | 'anonymous' | 'authenticated' | 'error';

export interface AuthState {
  bootstrapStatus: BootstrapStatus;
  selectedRole: AuthRole;
  identity: Identity | null;
  lastErrorCode: string | null;
}

const initialState: AuthState = {
  bootstrapStatus: 'idle',
  selectedRole: 'CUSTOMER',
  identity: null,
  lastErrorCode: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    bootstrapReset(state) { state.bootstrapStatus = 'idle'; state.lastErrorCode = null; },
    bootstrapStarted(state) {
      state.bootstrapStatus = 'restoring';
      state.lastErrorCode = null;
    },
    bootstrapAnonymous(state) {
      state.bootstrapStatus = 'anonymous';
      state.identity = null;
    },
    authenticated(state, action: PayloadAction<Identity>) {
      state.bootstrapStatus = 'authenticated';
      state.identity = action.payload;
      state.lastErrorCode = null;
    },
    bootstrapFailed(state, action: PayloadAction<string>) {
      state.bootstrapStatus = 'error';
      state.lastErrorCode = action.payload;
    },
    roleSelected(state, action: PayloadAction<AuthRole>) {
      state.selectedRole = action.payload;
    },
    signedOut(state) {
      state.bootstrapStatus = 'anonymous';
      state.identity = null;
      state.lastErrorCode = null;
    },
  },
});

export const authActions = authSlice.actions;
export const authReducer = authSlice.reducer;
