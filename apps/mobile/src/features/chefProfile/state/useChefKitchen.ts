import {chefProfileApi} from '../api/chefProfileApi';
import {useChefRead} from './useChefRead';

/**
 * The chef's kitchen, read under the same cache entry as every other Profile screen
 * (see createChefProfileKitchenQueryKey), so a save on one shows on all.
 */
export function useChefKitchen() {
  const {query, queryKey, identityId} = useChefRead('chef-profile-kitchen', signal => chefProfileApi.getKitchen(signal), {
    staleTime: 60_000,
  });
  return {kitchen: query.data ?? null, query, queryKey, identityId};
}
