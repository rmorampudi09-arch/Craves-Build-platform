import React from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  chefMenuApi,
  type ChefMenuItem,
} from '../api/chefMenuApi';
import {createChefMenuItemsQueryKey, chefMenuItemsQueryPrefix} from './chefMenuQuery';

export interface ChefMenuFeedback {
  kind: 'success' | 'error';
  message: string;
}

export interface ChefMenuModel {
  items: ChefMenuItem[];
  status: 'pending' | 'error' | 'success';
  isRefreshing: boolean;
  availabilityStateByItem: Record<string, boolean>;
  feedback: ChefMenuFeedback | null;
  refresh: () => Promise<void>;
  updateAvailability: (menuItemId: string, available: boolean) => Promise<void>;
  clearFeedback: () => void;
}

export function useChefMenuModel(): ChefMenuModel {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const activeAvailabilityMutations = React.useRef(new Set<string>());
  const [availabilityStateByItem, setAvailabilityStateByItem] = React.useState<
    Record<string, boolean>
  >({});
  const [feedback, setFeedback] = React.useState<ChefMenuFeedback | null>(null);

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

  const setCachedItem = React.useCallback(
    (updated: ChefMenuItem) => {
      const replaceItem = (current: ChefMenuItem[] | undefined) =>
        current?.map(item => (item.id === updated.id ? updated : item));
      queryClient.setQueryData<ChefMenuItem[]>(queryKey, replaceItem);
      if (dashboardMenuQueryKey) {
        queryClient.setQueryData<ChefMenuItem[]>(dashboardMenuQueryKey, replaceItem);
      }
    },
    [dashboardMenuQueryKey, queryClient, queryKey],
  );

  const updateAvailability = React.useCallback(
    async (menuItemId: string, available: boolean) => {
      if (!identityId || activeAvailabilityMutations.current.has(menuItemId)) {
        return;
      }

      activeAvailabilityMutations.current.add(menuItemId);
      setFeedback(null);
      setAvailabilityStateByItem(current => ({...current, [menuItemId]: true}));

      await Promise.all([
        queryClient.cancelQueries({queryKey}),
        dashboardMenuQueryKey
          ? queryClient.cancelQueries({queryKey: dashboardMenuQueryKey})
          : Promise.resolve(),
      ]);
      const previous = queryClient.getQueryData<ChefMenuItem[]>(queryKey);
      const previousDashboard = dashboardMenuQueryKey
        ? queryClient.getQueryData<ChefMenuItem[]>(dashboardMenuQueryKey)
        : undefined;
      const applyOptimisticAvailability = (current: ChefMenuItem[] | undefined) =>
        current?.map(item =>
          item.id === menuItemId ? {...item, available} : item,
        );
      queryClient.setQueryData<ChefMenuItem[]>(
        queryKey,
        applyOptimisticAvailability,
      );
      if (dashboardMenuQueryKey) {
        queryClient.setQueryData<ChefMenuItem[]>(
          dashboardMenuQueryKey,
          applyOptimisticAvailability,
        );
      }

      try {
        const updated = await chefMenuApi.updateAvailability(menuItemId, {available});
        setCachedItem(updated);
        setFeedback({
          kind: 'success',
          message: available
            ? 'Availability updated. Active items can now be offered to customers.'
            : 'Availability updated. This item is unavailable for sale.',
        });
        void queryClient.invalidateQueries({queryKey});
        if (dashboardMenuQueryKey) {
          void queryClient.invalidateQueries({queryKey: dashboardMenuQueryKey});
        }
      } catch {
        if (previous) {
          queryClient.setQueryData(queryKey, previous);
        }
        if (dashboardMenuQueryKey && previousDashboard) {
          queryClient.setQueryData(dashboardMenuQueryKey, previousDashboard);
        }
        setFeedback({
          kind: 'error',
          message: 'Availability could not be updated. Your previous menu state was restored.',
        });
      } finally {
        activeAvailabilityMutations.current.delete(menuItemId);
        setAvailabilityStateByItem(current => {
          if (!(menuItemId in current)) {
            return current;
          }
          const next = {...current};
          delete next[menuItemId];
          return next;
        });
      }
    },
    [dashboardMenuQueryKey, identityId, queryClient, queryKey, setCachedItem],
  );

  const refresh = React.useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    items: query.data ?? [],
    status: query.status,
    isRefreshing: query.isFetching,
    availabilityStateByItem,
    feedback,
    refresh,
    updateAvailability,
    clearFeedback: React.useCallback(() => setFeedback(null), []),
  };
}