import type {QueryClient} from '@tanstack/react-query';
import {clearPrivateQueryCache} from '../../../app/query/queryCache';
import {appQueryClient} from '../../../app/query/queryClient';
import type {AppDispatch} from '../../../app/store/store';
import {authActions} from '../../auth/state/authSlice';

/**
 * Switching away from Chef replaces the authenticated root. Chef-private query
 * state is removed before account resolution starts for the Customer role so a
 * later Customer screen cannot observe Chef-owned cached data.
 */
export async function switchChefToCustomerRole(
  dispatch: AppDispatch,
  queryClient: QueryClient = appQueryClient,
): Promise<void> {
  try {
    await clearPrivateQueryCache(queryClient, {role: 'CHEF'});
  } finally {
    dispatch(authActions.roleSelected('CUSTOMER'));
  }
}
