import {createPrivateQueryKey} from '../../../app/query/queryKeys';

const CHEF_PROFILE_KITCHEN_DOMAIN = 'chef-profile-kitchen';

export const chefProfileKitchenQueryPrefix = [
  'craves',
  'v1',
  'private',
  CHEF_PROFILE_KITCHEN_DOMAIN,
] as const;

export function createChefProfileKitchenQueryKey(identityId: string) {
  return createPrivateQueryKey(CHEF_PROFILE_KITCHEN_DOMAIN, {
    userId: identityId,
    role: 'CHEF',
  });
}
