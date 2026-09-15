import {QueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey, createPublicQueryKey} from '../../../app/query/queryKeys';
import {store} from '../../../app/store/store';
import {authActions} from '../../auth/state/authSlice';
import {switchChefToCustomerRole} from './chefProfileRoleSwitch';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('switchChefToCustomerRole', () => {
  afterEach(() => {
    store.dispatch(authActions.signedOut());
  });

  it('clears Chef-private queries, preserves other scopes, and requests Customer resolution', async () => {
    const queryClient = new QueryClient();
    const chefKey = createPrivateQueryKey('chef-profile-kitchen', {
      userId: USER_ID,
      role: 'CHEF',
    });
    const customerKey = createPrivateQueryKey('customer-profile', {
      userId: USER_ID,
      role: 'CUSTOMER',
    });
    const publicKey = createPublicQueryKey('catalog');
    queryClient.setQueryData(chefKey, {secret: 'chef'});
    queryClient.setQueryData(customerKey, {safe: 'customer'});
    queryClient.setQueryData(publicKey, {safe: 'public'});

    await switchChefToCustomerRole(store.dispatch, queryClient);

    expect(queryClient.getQueryData(chefKey)).toBeUndefined();
    expect(queryClient.getQueryData(customerKey)).toEqual({safe: 'customer'});
    expect(queryClient.getQueryData(publicKey)).toEqual({safe: 'public'});
    expect(store.getState().auth.selectedRole).toBe('CUSTOMER');
  });
});
