import type {QueryClient} from '@tanstack/react-query';
import {clearPrivateQueryCache} from '../../../app/query/queryCache';
import {appQueryClient} from '../../../app/query/queryClient';
import type {AppDispatch} from '../../../app/store/store';
import {authActions} from '../../auth/state/authSlice';

/**
 * Switching away from Chef replaces the authenticated root. Chef-private query
 * state must be removed before account resolution starts for the Customer role;
 * if isolation fails, remain in the Chef root rather than risk cross-role data.
 */
export async function switchChefToCustomerRole(
  dispatch: AppDispatch,
  queryClient: QueryClient = appQueryClient,
): Promise<void> {
  await clearPrivateQueryCache(queryClient, {role: 'CHEF'});
  dispatch(authActions.roleSelected('CUSTOMER'));
}
