import type {AppDispatch, RootState} from '../../../app/store/store';
import {toAppApiError, type AppApiError} from '../../../core/http/apiError';
import {cartApi} from '../api/cartApi';
import type {CartSnapshot} from '../domain/cartTypes';
import {cartActions} from './cartSlice';

export type CartRefreshOutcome =
  | {status: 'APPLIED'; snapshot: CartSnapshot}
  | {status: 'SKIPPED_DUPLICATE'}
  | {status: 'FAILED'; error: AppApiError};

type CartRefreshThunk = (
  dispatch: AppDispatch,
  getState: () => RootState,
) => Promise<CartRefreshOutcome>;

/**
 * Read-only cart refresh for the P46 screen. The existing snapshot remains in
 * state while refreshing so recoverable network failures never blank valid
 * cart lines or totals.
 */
export function refreshCartSnapshot(): CartRefreshThunk {
  return async (dispatch, getState) => {
    if (getState().cart.snapshotStatus === 'LOADING') {
      return {status: 'SKIPPED_DUPLICATE'};
    }

    dispatch(cartActions.snapshotLoadStarted());

    try {
      const snapshot = await cartApi.getSnapshot();
      dispatch(cartActions.snapshotAccepted(snapshot));
      return {status: 'APPLIED', snapshot};
    } catch (caught) {
      const error = toAppApiError(caught);
      dispatch(cartActions.snapshotLoadFailed({errorCode: error.code}));
      return {status: 'FAILED', error};
    }
  };
}
