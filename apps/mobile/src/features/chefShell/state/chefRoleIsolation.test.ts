import type {AppDispatch} from '../../../app/store/store';
import {cartActions} from '../../cart/state/cartSlice';
import {customerShellActions} from '../../customerShell/state/customerShellSlice';
import {discoveryFilterActions} from '../../discoveryFilters/state/discoveryFilterSlice';
import {discoverySearchActions} from '../../discoverySearch/state/discoverySearchSlice';
import {paymentMethodActions} from '../../payment/state/paymentMethodSlice';
import {
  isolateChefRole,
  resetCustomerRoleReduxState,
} from './chefRoleIsolation';

const expectedCustomerResetActions = [
  customerShellActions.resetCustomerShell(),
  discoveryFilterActions.resetDiscoveryFilters(),
  discoverySearchActions.resetDiscoverySearch(),
  paymentMethodActions.clearPrimaryPaymentMethod(),
  cartActions.resetCartDomain(),
];

describe('chefRoleIsolation', () => {
  it('clears every customer-only Redux domain owned by the P80 role policy', () => {
    const dispatch = jest.fn();

    resetCustomerRoleReduxState(dispatch as unknown as AppDispatch);

    expect(dispatch.mock.calls.map(call => call[0])).toEqual(expectedCustomerResetActions);
  });

  it('waits for customer-private cache removal before completing isolation', async () => {
    const dispatch = jest.fn();
    const clearCustomerPrivateCache = jest.fn().mockResolvedValue(undefined);

    await isolateChefRole(
      dispatch as unknown as AppDispatch,
      clearCustomerPrivateCache,
    );

    expect(clearCustomerPrivateCache).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls.map(call => call[0])).toEqual(expectedCustomerResetActions);
  });

  it('still resets local customer state when private cache cleanup fails', async () => {
    const dispatch = jest.fn();
    const cacheError = new Error('cache cleanup failed');
    const clearCustomerPrivateCache = jest.fn().mockRejectedValue(cacheError);

    await expect(
      isolateChefRole(
        dispatch as unknown as AppDispatch,
        clearCustomerPrivateCache,
      ),
    ).rejects.toBe(cacheError);

    expect(dispatch.mock.calls.map(call => call[0])).toEqual(expectedCustomerResetActions);
  });
});
