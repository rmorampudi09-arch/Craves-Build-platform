import {QueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey, createPublicQueryKey} from '../../../app/query/queryKeys';
import {authActions} from '../../auth/state/authSlice';
import {switchChefToCustomerRole} from './chefProfileRoleSwitch';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('switchChefToCustomerRole', () => {
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
    const dispatch = jest.fn();

    await switchChefToCustomerRole(dispatch as never, queryClient);

    expect(queryClient.getQueryData(chefKey)).toBeUndefined();
    expect(queryClient.getQueryData(customerKey)).toEqual({safe: 'customer'});
    expect(queryClient.getQueryData(publicKey)).toEqual({safe: 'public'});
    expect(dispatch).toHaveBeenCalledWith(authActions.roleSelected('CUSTOMER'));
  });
});
