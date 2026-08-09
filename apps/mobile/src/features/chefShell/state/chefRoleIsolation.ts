import type {AppDispatch} from '../../../app/store/store';
import {appQueryClient} from '../../../app/query/queryClient';
import {clearPrivateQueryCache} from '../../../app/query/queryCache';
import {cartActions} from '../../cart/state/cartSlice';
import {customerShellActions} from '../../customerShell/state/customerShellSlice';
import {discoveryFilterActions} from '../../discoveryFilters/state/discoveryFilterSlice';
import {discoverySearchActions} from '../../discoverySearch/state/discoverySearchSlice';
import {paymentMethodActions} from '../../payment/state/paymentMethodSlice';

type ClearCustomerPrivateCache = () => Promise<void>;

export function resetCustomerRoleReduxState(dispatch: AppDispatch) {
  dispatch(customerShellActions.resetCustomerShell());
  dispatch(discoveryFilterActions.resetDiscoveryFilters());
  dispatch(discoverySearchActions.resetDiscoverySearch());
  dispatch(paymentMethodActions.clearPrimaryPaymentMethod());
  dispatch(cartActions.resetCartDomain());
}

/**
 * P80 role boundary. Customer-private server state is removed before the Chef
 * product shell becomes usable, and local customer-only state is reset even if
 * React Query cancellation/removal fails so no customer cart/location/search
 * state can be rendered by a Chef-owned surface.
 */
export async function isolateChefRole(
  dispatch: AppDispatch,
  clearCustomerPrivateCache: ClearCustomerPrivateCache = () =>
    clearPrivateQueryCache(appQueryClient, {role: 'CUSTOMER'}),
) {
  try {
    await clearCustomerPrivateCache();
  } finally {
    resetCustomerRoleReduxState(dispatch);
  }
}
