import {buildCartScreenModel} from '../domain/cartScreenModel';
import type {CartDomainState} from './cartSlice';

export interface CartRootState {
  cart: CartDomainState;
}

export const selectCartDomain = (state: CartRootState): CartDomainState => state.cart;

export const selectCartSnapshot = (state: CartRootState) => state.cart.snapshot;

export const selectCartClientRevision = (state: CartRootState): number =>
  state.cart.clientRevision;

export const selectCartIsEmpty = (state: CartRootState): boolean =>
  (state.cart.snapshot?.lines.length ?? 0) === 0;

export const selectCartItemCount = (state: CartRootState): number =>
  state.cart.snapshot?.lines.reduce((total, line) => total + line.quantity, 0) ?? 0;

export const selectCartFoodSubtotal = (state: CartRootState) =>
  state.cart.snapshot?.totals.foodSubtotal ?? null;

export function selectCartQuantityForMenuItem(
  state: CartRootState,
  menuItemId: string,
): number {
  return state.cart.snapshot?.lines.find(line => line.menuItemId === menuItemId)?.quantity ?? 0;
}

export function selectCartMutation(state: CartRootState, key: string) {
  return state.cart.mutations[key] ?? null;
}

export const selectCartDependencies = (state: CartRootState) => state.cart.dependencies;

export const selectCartScreenModel = (state: CartRootState) =>
  state.cart.snapshot
    ? buildCartScreenModel(state.cart.snapshot, state.cart.dependencies)
    : null;
