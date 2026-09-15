import {createPrivateQueryKey} from '../../../app/query/queryKeys';

const CHEF_ROLE = 'CHEF' as const;
const CHEF_MENU_ITEMS_DOMAIN = 'chef-menu-items';

export const chefMenuItemsQueryPrefix = [
  'craves',
  'v1',
  'private',
  CHEF_MENU_ITEMS_DOMAIN,
] as const;

export function createChefMenuItemsQueryKey(identityId: string) {
  return createPrivateQueryKey(CHEF_MENU_ITEMS_DOMAIN, {
    userId: identityId,
    role: CHEF_ROLE,
  });
}
