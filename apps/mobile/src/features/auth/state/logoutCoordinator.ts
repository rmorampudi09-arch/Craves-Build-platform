import type {QueryClient} from '@tanstack/react-query';
import {clearPrivateQueryCache} from '../../../app/query/queryCache';
import {appQueryClient} from '../../../app/query/queryClient';
import type {AppDispatch} from '../../../app/store/store';
import {cartActions} from '../../cart/state/cartSlice';
import {customerShellActions} from '../../customerShell/state/customerShellSlice';
import {authActions} from './authSlice';
import {authService} from './authService';

async function clearPrivateClientState(queryClient: QueryClient): Promise<void> {
  try {
    await clearPrivateQueryCache(queryClient);
  } catch {
    // If targeted cleanup cannot finish, fail closed by discarding the whole query cache.
    queryClient.getQueryCache().clear();
  }

  queryClient.getMutationCache().clear();
}

export async function completeLogout(
  dispatch: AppDispatch,
  queryClient: QueryClient = appQueryClient,
): Promise<void> {
  try {
    await authService.logout();
  } catch {
    // Logout must still remove local app state even if session/provider cleanup is unavailable.
  }

  try {
    await clearPrivateClientState(queryClient);
  } catch {
    try {
      queryClient.clear();
    } catch {
      // The authenticated navigation root must still be removed below.
    }
  } finally {
    dispatch(cartActions.resetCartDomain());
    dispatch(customerShellActions.resetCustomerShell());
    dispatch(authActions.signedOut());
  }
}
