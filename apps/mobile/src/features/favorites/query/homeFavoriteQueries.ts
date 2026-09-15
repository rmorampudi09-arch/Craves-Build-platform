import {useInfiniteQuery, useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  homeFavoritesApi,
  type FavoriteEntityType,
  type FavoriteWatchChannel,
} from '../api/homeFavoritesApi';
import {favoriteHomeFeedApi} from '../api/favoriteHomeFeedApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const CHEFS_DOMAIN = 'customer-favorite-chefs';
const KITCHENS_DOMAIN = 'customer-favorite-kitchens';
const WATCHES_DOMAIN = 'customer-favorite-watches';
const HOME_FEED_DOMAIN = 'customer-favorite-home-feed';

function signedOutKey(domain: string) {
  return ['craves', 'v1', 'private', domain, 'signed-out'] as const;
}

export function useFavoriteChefsQuery() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createPrivateQueryKey(CHEFS_DOMAIN, {userId: identityId, role: CUSTOMER_ROLE})
    : signedOutKey(CHEFS_DOMAIN);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({pageParam, signal}) => homeFavoritesApi.listChefs(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    enabled: identityId !== null,
    staleTime: 30_000,
  });
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return {...query, items, identityId};
}

export function useFavoriteKitchensQuery() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createPrivateQueryKey(KITCHENS_DOMAIN, {userId: identityId, role: CUSTOMER_ROLE})
    : signedOutKey(KITCHENS_DOMAIN);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({pageParam, signal}) => homeFavoritesApi.listKitchens(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    enabled: identityId !== null,
    staleTime: 30_000,
  });
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return {...query, items, identityId};
}

export function useFavoriteWatchesQuery(entityType: FavoriteEntityType) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createPrivateQueryKey(WATCHES_DOMAIN, {
        userId: identityId,
        role: CUSTOMER_ROLE,
        filters: {entityType},
      })
    : signedOutKey(`${WATCHES_DOMAIN}:${entityType}`);
  const query = useQuery({
    queryKey,
    queryFn: ({signal}) => homeFavoritesApi.listWatches(entityType, signal),
    enabled: identityId !== null,
    staleTime: 30_000,
  });
  return {...query, identityId};
}

export function useFavoriteHomeFeedQuery(
  chefIdentityIds: readonly string[],
  kitchenIds: readonly string[],
) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const normalizedChefs = [...new Set(chefIdentityIds)].sort();
  const normalizedKitchens = [...new Set(kitchenIds)].sort();
  const queryKey = identityId
    ? createPrivateQueryKey(HOME_FEED_DOMAIN, {
        userId: identityId,
        role: CUSTOMER_ROLE,
        filters: {
          chefIdentityIds: normalizedChefs,
          kitchenIds: normalizedKitchens,
        },
      })
    : signedOutKey(HOME_FEED_DOMAIN);
  const hasRelationships = normalizedChefs.length + normalizedKitchens.length > 0;
  return useQuery({
    queryKey,
    queryFn: ({signal}) =>
      favoriteHomeFeedApi.resolve(
        {chefIdentityIds: normalizedChefs, kitchenIds: normalizedKitchens},
        signal,
      ),
    enabled: identityId !== null && hasRelationships,
    staleTime: 30_000,
  });
}

export function useToggleFavoriteChef() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['favorites-p2', 'chef-toggle'],
    mutationFn: async ({chefIdentityId, favorite}: {chefIdentityId: string; favorite: boolean}) => {
      if (!identityId) throw new Error('A signed-in customer is required.');
      if (favorite) {
        await homeFavoritesApi.removeChef(chefIdentityId);
        return {chefIdentityId, favorite: false};
      }
      await homeFavoritesApi.saveChef(chefIdentityId);
      return {chefIdentityId, favorite: true};
    },
    onSuccess: async () => {
      if (!identityId) return;
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['craves', 'v1', 'private', CHEFS_DOMAIN]}),
        queryClient.invalidateQueries({queryKey: ['craves', 'v1', 'private', HOME_FEED_DOMAIN]}),
      ]);
    },
  });
}

export function useToggleFavoriteKitchen() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['favorites-p2', 'kitchen-toggle'],
    mutationFn: async ({kitchenId, favorite}: {kitchenId: string; favorite: boolean}) => {
      if (!identityId) throw new Error('A signed-in customer is required.');
      if (favorite) {
        await homeFavoritesApi.removeKitchen(kitchenId);
        return {kitchenId, favorite: false};
      }
      await homeFavoritesApi.saveKitchen(kitchenId);
      return {kitchenId, favorite: true};
    },
    onSuccess: async () => {
      if (!identityId) return;
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['craves', 'v1', 'private', KITCHENS_DOMAIN]}),
        queryClient.invalidateQueries({queryKey: ['craves', 'v1', 'private', HOME_FEED_DOMAIN]}),
      ]);
    },
  });
}

export function useToggleFavoriteWatch(entityType: FavoriteEntityType) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['favorites-p2', 'watch-toggle', entityType],
    mutationFn: async ({
      entityId,
      channel,
      enabled,
    }: {
      entityId: string;
      channel: FavoriteWatchChannel;
      enabled: boolean;
    }) => {
      if (!identityId) throw new Error('A signed-in customer is required.');
      return homeFavoritesApi.setWatch(entityType, entityId, channel, enabled);
    },
    onSuccess: async () => {
      if (!identityId) return;
      await queryClient.invalidateQueries({queryKey: ['craves', 'v1', 'private', WATCHES_DOMAIN]});
    },
  });
}
