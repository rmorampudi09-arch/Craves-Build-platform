import type {AppDispatch, RootState} from '../../../app/store/store';
import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {cartApi} from '../api/cartApi';
import type {CartSnapshot} from '../domain/cartTypes';
import {cartActions} from './cartSlice';

export interface AddCartItemCommand {
  menuItemId: string;
  quantity: number;
}

export interface SetCartItemQuantityCommand {
  lineId: string;
  quantity: number;
}

export interface RemoveCartItemCommand {
  lineId: string;
}

export type CartMutationOutcome =
  | {status: 'APPLIED'; snapshot: CartSnapshot}
  | {status: 'SKIPPED_DUPLICATE'}
  | {status: 'FAILED'; error: AppApiError};

type CartMutationThunk = (
  dispatch: AppDispatch,
  getState: () => RootState,
) => Promise<CartMutationOutcome>;

let mutationQueue: Promise<void> = Promise.resolve();
let requestSequence = 0;

function nextRequestId(): string {
  requestSequence += 1;
  return `cart-${Date.now()}-${requestSequence}`;
}

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const scheduled = mutationQueue.then(operation, operation);
  mutationQueue = scheduled.then(
    () => undefined,
    () => undefined,
  );
  return scheduled;
}

function menuMutationKey(menuItemId: string): string {
  return `menu:${menuItemId}`;
}

function lineMutationKey(lineId: string): string {
  return `line:${lineId}`;
}

function isPendingMutation(state: RootState, key: string): boolean {
  return state.cart.mutations[key]?.status === 'PENDING';
}

function invalidQuantityError(): AppApiError {
  return new AppApiError(
    'CART_INVALID_QUANTITY',
    'Choose a quantity of at least one item.',
  );
}

function missingSnapshotError(): AppApiError {
  return new AppApiError(
    'CART_SNAPSHOT_REQUIRED',
    'Refresh the cart before changing this item.',
  );
}

function quantitySnapshot(
  snapshot: CartSnapshot,
  lineId: string,
  quantity: number,
): CartSnapshot | null {
  let found = false;
  const lines = snapshot.lines.map(line => {
    if (line.lineId !== lineId) {
      return line;
    }
    found = true;
    return {...line, quantity};
  });

  return found ? {...snapshot, lines} : null;
}

function removedLineSnapshot(
  snapshot: CartSnapshot,
  lineId: string,
): CartSnapshot | null {
  const lines = snapshot.lines.filter(line => line.lineId !== lineId);
  return lines.length === snapshot.lines.length ? null : {...snapshot, lines};
}

function markMutationFailed(
  dispatch: AppDispatch,
  key: string,
  requestId: string,
  error: AppApiError,
): CartMutationOutcome {
  dispatch(
    cartActions.mutationFailed({
      key,
      requestId,
      errorCode: error.code,
    }),
  );
  return {status: 'FAILED', error};
}

function markMutationSucceeded(
  dispatch: AppDispatch,
  key: string,
  requestId: string,
  snapshot: CartSnapshot,
): CartMutationOutcome {
  dispatch(cartActions.snapshotAccepted(snapshot));
  dispatch(cartActions.mutationSucceeded({key, requestId}));
  return {status: 'APPLIED', snapshot};
}

export function addCartItem(command: AddCartItemCommand): CartMutationThunk {
  return async (dispatch, getState) => {
    if (!Number.isSafeInteger(command.quantity) || command.quantity < 1) {
      return {status: 'FAILED', error: invalidQuantityError()};
    }

    const key = menuMutationKey(command.menuItemId);
    if (isPendingMutation(getState(), key)) {
      return {status: 'SKIPPED_DUPLICATE'};
    }

    const requestId = nextRequestId();
    dispatch(
      cartActions.mutationStarted({
        key,
        requestId,
        scope: 'LINE',
      }),
    );

    return enqueueMutation(async () => {
      try {
        const snapshot = await cartApi.addItem(command.menuItemId, command.quantity);
        return markMutationSucceeded(dispatch, key, requestId, snapshot);
      } catch (error) {
        return markMutationFailed(
          dispatch,
          key,
          requestId,
          toAppApiError(error),
        );
      }
    });
  };
}

export function setCartItemQuantity(
  command: SetCartItemQuantityCommand,
): CartMutationThunk {
  return async (dispatch, getState) => {
    if (!Number.isSafeInteger(command.quantity) || command.quantity < 1) {
      return {status: 'FAILED', error: invalidQuantityError()};
    }

    const key = lineMutationKey(command.lineId);
    if (isPendingMutation(getState(), key)) {
      return {status: 'SKIPPED_DUPLICATE'};
    }

    const requestId = nextRequestId();
    dispatch(
      cartActions.mutationStarted({
        key,
        requestId,
        scope: 'LINE',
        targetLineId: command.lineId,
      }),
    );

    return enqueueMutation(async () => {
      const previousSnapshot = getState().cart.snapshot;
      const previousRevision = getState().cart.clientRevision;
      if (!previousSnapshot) {
        return markMutationFailed(
          dispatch,
          key,
          requestId,
          missingSnapshotError(),
        );
      }

      const optimisticSnapshot = quantitySnapshot(
        previousSnapshot,
        command.lineId,
        command.quantity,
      );
      if (!optimisticSnapshot) {
        const error = new AppApiError(
          'CART_LINE_NOT_FOUND',
          'This cart item is no longer available. Refresh the cart and try again.',
        );
        return markMutationFailed(dispatch, key, requestId, error);
      }

      dispatch(cartActions.snapshotOptimisticallyApplied(optimisticSnapshot));

      try {
        const snapshot = await cartApi.updateItem(command.lineId, command.quantity);
        return markMutationSucceeded(dispatch, key, requestId, snapshot);
      } catch (error) {
        dispatch(
          cartActions.snapshotRollbackApplied({
            snapshot: previousSnapshot,
            expectedClientRevision: previousRevision,
          }),
        );
        return markMutationFailed(
          dispatch,
          key,
          requestId,
          toAppApiError(error),
        );
      }
    });
  };
}

export function removeCartItem(command: RemoveCartItemCommand): CartMutationThunk {
  return async (dispatch, getState) => {
    const key = lineMutationKey(command.lineId);
    if (isPendingMutation(getState(), key)) {
      return {status: 'SKIPPED_DUPLICATE'};
    }

    const requestId = nextRequestId();
    dispatch(
      cartActions.mutationStarted({
        key,
        requestId,
        scope: 'LINE',
        targetLineId: command.lineId,
      }),
    );

    return enqueueMutation(async () => {
      const previousSnapshot = getState().cart.snapshot;
      const previousRevision = getState().cart.clientRevision;
      if (!previousSnapshot) {
        return markMutationFailed(
          dispatch,
          key,
          requestId,
          missingSnapshotError(),
        );
      }

      const optimisticSnapshot = removedLineSnapshot(previousSnapshot, command.lineId);
      if (!optimisticSnapshot) {
        const error = new AppApiError(
          'CART_LINE_NOT_FOUND',
          'This cart item is no longer available. Refresh the cart and try again.',
        );
        return markMutationFailed(dispatch, key, requestId, error);
      }

      dispatch(cartActions.snapshotOptimisticallyApplied(optimisticSnapshot));

      try {
        const snapshot = await cartApi.removeItem(command.lineId);
        return markMutationSucceeded(dispatch, key, requestId, snapshot);
      } catch (error) {
        dispatch(
          cartActions.snapshotRollbackApplied({
            snapshot: previousSnapshot,
            expectedClientRevision: previousRevision,
          }),
        );
        return markMutationFailed(
          dispatch,
          key,
          requestId,
          toAppApiError(error),
        );
      }
    });
  };
}
