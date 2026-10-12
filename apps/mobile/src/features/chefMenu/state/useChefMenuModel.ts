import React from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {chefMenuApi, type ChefMenuItem} from '../api/chefMenuApi';
import {buildChefMenuPublishRequest, chefMenuItemToFormValues} from '../domain/chefMenuForm';
import {createChefMenuItemsQueryKey, chefMenuItemsQueryPrefix} from './chefMenuQuery';

export interface ChefMenuModel {
  items: ChefMenuItem[];
  status: 'pending' | 'error' | 'success';
  isRefreshing: boolean;
  /** Dishes with a change in flight (a switch or Publish). Their controls stay disabled until it ends. */
  availabilityStateByItem: Record<string, boolean>;
  refresh: () => Promise<void>;
  /** Switches a dish on or off for customers at once; puts it back if the server says no. True when saved. */
  updateAvailability: (menuItemId: string, available: boolean) => Promise<boolean>;
  /** Saves a draft as ACTIVE and on, at once; puts it back if the server says no. True when saved. */
  publishDraft: (item: ChefMenuItem) => Promise<boolean>;
}

export function useChefMenuModel(): ChefMenuModel {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const activeMutations = React.useRef(new Set<string>());
  const [availabilityStateByItem, setAvailabilityStateByItem] = React.useState<Record<string, boolean>>({});

  const dashboardMenuQueryKey = React.useMemo(
    () =>
      identityId
        ? createPrivateQueryKey('chef-dashboard-menu', {
            userId: identityId,
            role: 'CHEF',
          })
        : null,
    [identityId],
  );

  const queryKey = React.useMemo(
    () =>
      identityId
        ? createChefMenuItemsQueryKey(identityId)
        : [...chefMenuItemsQueryPrefix, 'signed-out'] as const,
    [identityId],
  );

  const query = useQuery({
    queryKey,
    queryFn: ({signal}) => chefMenuApi.listItems(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
    // Image upload is a separate multipart write after create/replace. Reconcile
    // on mount so a freshly uploaded primary image cannot be hidden by the
    // pre-upload menu item that is still fresh in the React Query cache.
    refetchOnMount: 'always',
  });

  /** One change to one dish: shown at once, kept when the server saves it, undone when it does not. */
  const change = React.useCallback(
    async (
      menuItemId: string,
      optimistic: (item: ChefMenuItem) => ChefMenuItem,
      save: () => Promise<ChefMenuItem>,
    ): Promise<boolean> => {
      if (!identityId || activeMutations.current.has(menuItemId)) {
        return false;
      }
      activeMutations.current.add(menuItemId);
      setAvailabilityStateByItem(current => ({...current, [menuItemId]: true}));

      const keys = dashboardMenuQueryKey ? [queryKey, dashboardMenuQueryKey] : [queryKey];
      const patch = (replace: (item: ChefMenuItem) => ChefMenuItem) =>
        keys.forEach(key =>
          queryClient.setQueryData<ChefMenuItem[]>(key, current =>
            current?.map(item => (item.id === menuItemId ? replace(item) : item)),
          ),
        );
      let previous: (readonly [readonly unknown[], ChefMenuItem[] | undefined])[] = [];
      try {
        // A list refresh already on its way must not land over the change.
        await Promise.all(keys.map(key => queryClient.cancelQueries({queryKey: key})));
        previous = keys.map(key => [key, queryClient.getQueryData<ChefMenuItem[]>(key)] as const);
        patch(optimistic);
        const saved = await save();
        patch(() => saved);
        for (const key of keys) {
          void queryClient.invalidateQueries({queryKey: key});
        }
        return true;
      } catch {
        previous.forEach(([key, data]) => data && queryClient.setQueryData(key, data));
        return false;
      } finally {
        activeMutations.current.delete(menuItemId);
        setAvailabilityStateByItem(current => {
          const next = {...current};
          delete next[menuItemId];
          return next;
        });
      }
    },
    [dashboardMenuQueryKey, identityId, queryClient, queryKey],
  );

  const updateAvailability = React.useCallback(
    (menuItemId: string, available: boolean) =>
      change(
        menuItemId,
        item => ({...item, available}),
        () => chefMenuApi.updateAvailability(menuItemId, {available}),
      ),
    [change],
  );

  const publishDraft = React.useCallback(
    (item: ChefMenuItem) =>
      change(
        item.id,
        current => ({...current, status: 'ACTIVE', available: true}),
        () => chefMenuApi.replaceItem(item.id, buildChefMenuPublishRequest(chefMenuItemToFormValues(item), item)),
      ),
    [change],
  );

  const refresh = React.useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    items: query.data ?? [],
    status: query.status,
    isRefreshing: query.isFetching,
    availabilityStateByItem,
    refresh,
    updateAvailability,
    publishDraft,
  };
}
