import type {QueryClient} from '@tanstack/react-query';
import {chefBusinessInformationQueryPrefix} from '../../chefBusinessInformation/state/chefBusinessInformationQuery';
import type {ChefKitchenProfile} from '../api/chefProfileApi';
import {
  chefProfileKitchenQueryPrefix,
  createChefProfileKitchenQueryKey,
} from './chefProfileQuery';

/**
 * All current Chef identity surfaces read the canonical chef-profile-kitchen
 * query. Update that cache synchronously so mounted surfaces change together,
 * then revalidate both profile and business-verification reads so navigation to
 * another Chef identity surface cannot reuse stale server state after a save.
 */
export function synchronizeChefProfileAfterSave(
  queryClient: QueryClient,
  identityId: string,
  updated: ChefKitchenProfile,
): Promise<void> {
  queryClient.setQueryData<ChefKitchenProfile>(
    createChefProfileKitchenQueryKey(identityId),
    updated,
  );
  return Promise.all([
    queryClient.invalidateQueries({queryKey: chefProfileKitchenQueryPrefix}),
    queryClient.invalidateQueries({
      queryKey: chefBusinessInformationQueryPrefix,
    }),
  ]).then(() => undefined);
}
