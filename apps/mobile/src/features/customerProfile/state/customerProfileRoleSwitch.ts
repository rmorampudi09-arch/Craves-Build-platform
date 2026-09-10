import type {QueryClient} from '@tanstack/react-query';
import {clearPrivateQueryCache} from '../../../app/query/queryCache';
import {appQueryClient} from '../../../app/query/queryClient';
import type {AppDispatch} from '../../../app/store/store';
import {authActions} from '../../auth/state/authSlice';

/**
 * Switching away from Customer replaces the authenticated product root.
 * Remove Customer-private query state before requesting Chef account resolution.
 */
export async function switchCustomerToChefRole(
  dispatch: AppDispatch,
  queryClient: QueryClient = appQueryClient,
): Promise<void> {
  await clearPrivateQueryCache(queryClient, {role: 'CUSTOMER'});
  dispatch(authActions.roleSelected('CHEF'));
}
