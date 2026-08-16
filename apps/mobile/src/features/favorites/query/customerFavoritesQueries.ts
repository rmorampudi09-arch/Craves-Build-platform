import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  customerFavoritesApi,
  type CustomerFavorite,
} from '../api/customerFavoritesApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const FAVORITES_DOMAIN = 'customer-favorites';

export const customerFavoritesQueryPrefix = [
  'craves',
  'v1',
  'private',
  FAVORITES_DOMAIN,
] as const;

export function createCustomerFavoritesQueryKey(identityId: string) {
  return createPrivateQueryKey(FAVORITES_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    paging: {limit: 200},
  });
}

export function useCustomerFavoritesQuery() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createCustomerFavoritesQueryKey(identityId)
    : ([...customerFavoritesQueryPrefix, 'signed-out'] as const);
  const query = useQuery({
    queryKey,
    queryFn: ({signal}) => customerFavoritesApi.list(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
  });

  return {
    ...query,
    identityId,
    sessionRequired: identityId === null,
  };
}

export function useToggleCustomerFavorite() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...customerFavoritesQueryPrefix, 'toggle'],
    mutationFn: async ({menuItemId, favorite}: {menuItemId: string; favorite: boolean}) => {
      if (favorite) {
        await customerFavoritesApi.remove(menuItemId);
        return {menuItemId, favorite: false as const, createdAt: null};
      }
      const saved = await customerFavoritesApi.save(menuItemId);
      return {menuItemId, favorite: true as const, createdAt: saved.createdAt};
    },
    onSuccess: result => {
      if (!identityId) return;
      const queryKey = createCustomerFavoritesQueryKey(identityId);
      queryClient.setQueryData<CustomerFavorite[]>(queryKey, current => {
        const withoutItem = (current ?? []).filter(
          favorite => favorite.menuItemId !== result.menuItemId,
        );
        if (!result.favorite || !result.createdAt) return withoutItem;
        return [
          {menuItemId: result.menuItemId, createdAt: result.createdAt},
          ...withoutItem,
        ];
      });
    },
  });
}

export function isFavoriteMenuItem(
  favorites: readonly CustomerFavorite[] | undefined,
  menuItemId: string,
): boolean {
  return Boolean(favorites?.some(favorite => favorite.menuItemId === menuItemId));
}
