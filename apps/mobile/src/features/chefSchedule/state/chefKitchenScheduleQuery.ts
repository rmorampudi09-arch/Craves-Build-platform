import {createPrivateQueryKey} from '../../../app/query/queryKeys';

const DOMAIN = 'chef-kitchen-schedule';

export const chefKitchenScheduleQueryPrefix = ['craves', 'v1', 'private', DOMAIN] as const;

/** The kitchen schedule's cache entry, shared by the Opening hours screen and the kitchen open state. */
export function createChefKitchenScheduleQueryKey(identityId: string) {
  return createPrivateQueryKey(DOMAIN, {userId: identityId, role: 'CHEF'});
}
