import {createPrivateQueryKey} from '../../../app/query/queryKeys';

const CHEF_BUSINESS_INFORMATION_DOMAIN = 'chef-business-information';

export const chefBusinessInformationQueryPrefix = [
  'craves',
  'v1',
  'private',
  CHEF_BUSINESS_INFORMATION_DOMAIN,
] as const;

export function createChefBusinessVerificationQueryKey(identityId: string) {
  return createPrivateQueryKey(CHEF_BUSINESS_INFORMATION_DOMAIN, {
    userId: identityId,
    role: 'CHEF',
  });
}
