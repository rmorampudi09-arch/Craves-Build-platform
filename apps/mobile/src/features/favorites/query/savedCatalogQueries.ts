import {useQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  savedCatalogApi,
  type SavedCatalogItem,
} from '../api/savedCatalogApi';
import type {CustomerFavorite} from '../api/customerFavoritesApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const SAVED_CATALOG_DOMAIN = 'customer-saved-catalog';

export function createSavedCatalogQueryKey(
  identityId: string,
  menuItemIds: readonly string[],
) {
  return createPrivateQueryKey(SAVED_CATALOG_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    paging: {limit: menuItemIds.length},
    filters: {menuItemIds: [...menuItemIds]},
  });
}

export function savedMenuItemIds(
  favorites: readonly CustomerFavorite[] | undefined,
): string[] {
  return (favorites ?? []).map(favorite => favorite.menuItemId);
}

export function useSavedCatalogQuery(
  favorites: readonly CustomerFavorite[] | undefined,
  favoritesReady: boolean,
) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const menuItemIds = savedMenuItemIds(favorites);
  const queryKey = identityId
    ? createSavedCatalogQueryKey(identityId, menuItemIds)
    : (['craves', 'v1', 'private', SAVED_CATALOG_DOMAIN, 'signed-out'] as const);

  const query = useQuery<SavedCatalogItem[]>({
    queryKey,
    queryFn: ({signal}) => savedCatalogApi.resolve(menuItemIds, signal),
    enabled: Boolean(identityId) && favoritesReady && menuItemIds.length > 0,
    staleTime: 30_000,
  });

  return {
    ...query,
    identityId,
    menuItemIds,
    sessionRequired: identityId === null,
  };
}
