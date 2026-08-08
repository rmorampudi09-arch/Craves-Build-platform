import {createSlice, type PayloadAction} from '@reduxjs/toolkit';
import type {
  CartAddressDependency,
  CartDependencies,
  CartDependencyStatus,
  CartMutationEntry,
  CartMutationScope,
  CartSnapshot,
  CartSnapshotStatus,
} from '../domain/cartTypes';

export interface CartDomainState {
  snapshotStatus: CartSnapshotStatus;
  snapshot: CartSnapshot | null;
  clientRevision: number;
  snapshotErrorCode: string | null;
  dependencies: CartDependencies;
  mutations: Record<string, CartMutationEntry>;
}

const initialDependencies: CartDependencies = {
  coupon: {status: 'UNRESOLVED'},
  address: {status: 'UNRESOLVED', addressId: null},
  deliveryQuote: {status: 'UNRESOLVED'},
};

const initialState: CartDomainState = {
  snapshotStatus: 'UNINITIALIZED',
  snapshot: null,
  clientRevision: 0,
  snapshotErrorCode: null,
  dependencies: initialDependencies,
  mutations: {},
};

interface MutationStartedPayload {
  key: string;
  requestId: string;
  scope: CartMutationScope;
  targetLineId?: string | null;
}

interface MutationCompletionPayload {
  key: string;
  requestId: string;
}

interface MutationFailedPayload extends MutationCompletionPayload {
  errorCode: string;
}

interface DependencyStatusPayload {
  dependency: 'coupon' | 'deliveryQuote';
  status: CartDependencyStatus;
}

interface SnapshotRollbackPayload {
  snapshot: CartSnapshot;
  expectedClientRevision: number;
}

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    snapshotLoadStarted(state) {
      state.snapshotStatus = 'LOADING';
      state.snapshotErrorCode = null;
    },
    snapshotAccepted(state, action: PayloadAction<CartSnapshot>) {
      state.snapshot = action.payload;
      state.snapshotStatus = 'READY';
      state.snapshotErrorCode = null;
      state.clientRevision += 1;
    },
    snapshotOptimisticallyApplied(state, action: PayloadAction<CartSnapshot>) {
      state.snapshot = action.payload;
      state.snapshotStatus = 'READY';
      state.snapshotErrorCode = null;
    },
    snapshotRollbackApplied(state, action: PayloadAction<SnapshotRollbackPayload>) {
      if (state.clientRevision !== action.payload.expectedClientRevision) {
        return;
      }
      state.snapshot = action.payload.snapshot;
      state.snapshotStatus = 'READY';
      state.snapshotErrorCode = null;
    },
    snapshotLoadFailed(state, action: PayloadAction<{errorCode: string}>) {
      state.snapshotStatus = 'ERROR';
      state.snapshotErrorCode = action.payload.errorCode;
    },
    dependencyStatusChanged(state, action: PayloadAction<DependencyStatusPayload>) {
      state.dependencies[action.payload.dependency].status = action.payload.status;
    },
    addressDependencyChanged(state, action: PayloadAction<CartAddressDependency>) {
      state.dependencies.address = action.payload;
    },
    mutationStarted(state, action: PayloadAction<MutationStartedPayload>) {
      const {key, requestId, scope, targetLineId = null} = action.payload;
      state.mutations[key] = {
        requestId,
        scope,
        targetLineId,
        status: 'PENDING',
        errorCode: null,
      };
    },
    mutationSucceeded(state, action: PayloadAction<MutationCompletionPayload>) {
      const current = state.mutations[action.payload.key];
      if (current?.requestId === action.payload.requestId) {
        delete state.mutations[action.payload.key];
      }
    },
    mutationFailed(state, action: PayloadAction<MutationFailedPayload>) {
      const current = state.mutations[action.payload.key];
      if (current?.requestId === action.payload.requestId) {
        current.status = 'FAILED';
        current.errorCode = action.payload.errorCode;
      }
    },
    mutationCleared(state, action: PayloadAction<{key: string}>) {
      delete state.mutations[action.payload.key];
    },
    resetCartDomain() {
      return initialState;
    },
  },
});

export const cartActions = cartSlice.actions;
export const cartReducer = cartSlice.reducer;
