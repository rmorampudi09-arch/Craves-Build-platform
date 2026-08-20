import {useSyncExternalStore} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {
  customerFavoritesApi,
  type CustomerFavorite,
} from '../api/customerFavoritesApi';
import {
  discardFavoriteMutation,
  enqueueFavoriteMutation,
  getFavoriteMutationQueueSnapshot,
  subscribeFavoriteMutationQueue,
} from '../offline/customerFavoritesOfflineQueue';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const FAVORITES_DOMAIN = 'customer-favorites';
const EMPTY_FAVORITE_QUEUE = [] as const;

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

interface ToggleVariables {
  menuItemId: string;
  favorite: boolean;
}

interface ToggleResult {
  menuItemId: string;
  favorite: boolean;
  createdAt: string | null;
  queued: boolean;
}

interface ToggleContext {
  queryKey: ReturnType<typeof createCustomerFavoritesQueryKey>;
  previous: CustomerFavorite[] | undefined;
}

export function applyOptimisticFavoriteState(
  current: CustomerFavorite[] | undefined,
  menuItemId: string,
  targetFavorite: boolean,
  now = new Date().toISOString(),
): CustomerFavorite[] {
  const withoutItem = (current ?? []).filter(item => item.menuItemId !== menuItemId);
  if (!targetFavorite) return withoutItem;
  return [{menuItemId, createdAt: now}, ...withoutItem];
}

export function useToggleCustomerFavorite() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();

  return useMutation<ToggleResult, Error, ToggleVariables, ToggleContext>({
    mutationKey: [...customerFavoritesQueryPrefix, 'toggle'],
    mutationFn: async ({menuItemId, favorite}) => {
      if (!identityId) {
        throw new Error('A signed-in customer is required to change Favorites.');
      }

      const targetFavorite = !favorite;
      try {
        if (targetFavorite) {
          const saved = await customerFavoritesApi.save(menuItemId);
          await discardFavoriteMutation(identityId, menuItemId);
          return {
            menuItemId,
            favorite: true,
            createdAt: saved.createdAt,
            queued: false,
          };
        }

        await customerFavoritesApi.remove(menuItemId);
        await discardFavoriteMutation(identityId, menuItemId);
        return {
          menuItemId,
          favorite: false,
          createdAt: null,
          queued: false,
        };
      } catch (error) {
        const apiError = toAppApiError(error);
        if (!apiError.cancelled && (apiError.retriable || apiError.status === undefined)) {
          await enqueueFavoriteMutation(identityId, menuItemId, targetFavorite);
          return {
            menuItemId,
            favorite: targetFavorite,
            createdAt: targetFavorite ? new Date().toISOString() : null,
            queued: true,
          };
        }
        throw apiError;
      }
    },
    onMutate: async ({menuItemId, favorite}) => {
      if (!identityId) {
        throw new Error('A signed-in customer is required to change Favorites.');
      }
      const queryKey = createCustomerFavoritesQueryKey(identityId);
      await queryClient.cancelQueries({queryKey, exact: true});
      const previous = queryClient.getQueryData<CustomerFavorite[]>(queryKey);
      queryClient.setQueryData<CustomerFavorite[]>(queryKey, current =>
        applyOptimisticFavoriteState(current, menuItemId, !favorite),
      );
      return {queryKey, previous};
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      queryClient.setQueryData(context.queryKey, context.previous);
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

export function useCustomerFavoritesQueueState() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queue = useSyncExternalStore(
    subscribeFavoriteMutationQueue,
    () => getFavoriteMutationQueueSnapshot(identityId),
    () => EMPTY_FAVORITE_QUEUE,
  );
  return {
    pendingCount: queue.length,
    pendingMenuItemIds: queue.map(item => item.menuItemId),
    hasPendingChanges: queue.length > 0,
  };
}

export function isFavoriteMenuItem(
  favorites: readonly CustomerFavorite[] | undefined,
  menuItemId: string,
): boolean {
  return Boolean(favorites?.some(favorite => favorite.menuItemId === menuItemId));
}
