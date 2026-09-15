import {QueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey, createPublicQueryKey} from '../../../app/query/queryKeys';
import {store} from '../../../app/store/store';
import {authActions} from '../../auth/state/authSlice';
import {switchCustomerToChefRole} from './customerProfileRoleSwitch';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('switchCustomerToChefRole', () => {
  afterEach(() => {
    store.dispatch(authActions.signedOut());
  });

  it('clears Customer-private queries, preserves other scopes, and requests Chef resolution', async () => {
    const queryClient = new QueryClient();
    const customerKey = createPrivateQueryKey('customer-profile', {
      userId: USER_ID,
      role: 'CUSTOMER',
    });
    const chefKey = createPrivateQueryKey('chef-profile-kitchen', {
      userId: USER_ID,
      role: 'CHEF',
    });
    const publicKey = createPublicQueryKey('catalog');
    queryClient.setQueryData(customerKey, {secret: 'customer'});
    queryClient.setQueryData(chefKey, {safe: 'chef'});
    queryClient.setQueryData(publicKey, {safe: 'public'});

    await switchCustomerToChefRole(store.dispatch, queryClient);

    expect(queryClient.getQueryData(customerKey)).toBeUndefined();
    expect(queryClient.getQueryData(chefKey)).toEqual({safe: 'chef'});
    expect(queryClient.getQueryData(publicKey)).toEqual({safe: 'public'});
    expect(store.getState().auth.selectedRole).toBe('CHEF');
  });
});
