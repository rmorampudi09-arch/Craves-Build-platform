import type {QueryClient} from '@tanstack/react-query';
import type {ChefKitchenProfile} from '../api/chefProfileApi';
import {
  chefProfileKitchenQueryPrefix,
  createChefProfileKitchenQueryKey,
} from './chefProfileQuery';

/**
 * All current Chef identity surfaces read the canonical chef-profile-kitchen
 * query. Update that cache synchronously so mounted surfaces change together,
 * then mark the profile domain stale so active observers revalidate against the
 * server without requiring a manual refresh.
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
  return queryClient
    .invalidateQueries({queryKey: chefProfileKitchenQueryPrefix})
    .then(() => undefined);
}
