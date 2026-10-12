import React from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {AppApiError} from '../../../core/http/apiError';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {chefMenuApi, type ChefMenuItem} from '../api/chefMenuApi';
import {
  buildChefMenuPublishRequest,
  buildChefMenuReplacementRequest,
  type ChefMenuFormValues,
} from '../domain/chefMenuForm';
import {createChefMenuItemsQueryKey} from './chefMenuQuery';

export interface ChefEditMenuItemModel {
  submitState: 'idle' | 'submitting' | 'error' | 'success';
  errorMessage: string | null;
  errorDetails: readonly string[];
  /** Saves the form. With `publish`, a draft goes live (ACTIVE and on) in the same save. */
  submit: (
    values: ChefMenuFormValues,
    existingItem: ChefMenuItem,
    publish?: boolean,
  ) => Promise<ChefMenuItem | null>;
  deleting: boolean;
  /** Deletes (archives) the dish. null when a delete is already running. */
  remove: (item: ChefMenuItem) => Promise<'deleted' | 'coming-soon' | 'failed' | null>;
  clearError: () => void;
}

function publicSubmitFailure(cause: unknown): {
  message: string;
  details: readonly string[];
} {
  if (cause instanceof AppApiError) {
    return {message: cause.message, details: cause.details};
  }
  return {
    message: 'The dish could not be saved. Check your details and try again.',
    details: [],
  };
}

export function useChefEditMenuItemModel(): ChefEditMenuItemModel {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const activeSubmission = React.useRef(false);
  const [submitState, setSubmitState] = React.useState<
    ChefEditMenuItemModel['submitState']
  >('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [errorDetails, setErrorDetails] = React.useState<readonly string[]>([]);

  const submit = React.useCallback(
    async (values: ChefMenuFormValues, existingItem: ChefMenuItem, publish = false) => {
      if (activeSubmission.current) {
        return null;
      }
      if (!identityId) {
        setSubmitState('error');
        setErrorMessage(
          'Your Chef session is unavailable. Sign in again before saving a dish.',
        );
        setErrorDetails([]);
        return null;
      }

      activeSubmission.current = true;
      setSubmitState('submitting');
      setErrorMessage(null);
      setErrorDetails([]);

      try {
        const updated = await chefMenuApi.replaceItem(
          existingItem.id,
          publish
            ? buildChefMenuPublishRequest(values, existingItem)
            : buildChefMenuReplacementRequest(values, existingItem),
        );
        const menuQueryKey = createChefMenuItemsQueryKey(identityId);
        const dashboardMenuQueryKey = createPrivateQueryKey('chef-dashboard-menu', {
          userId: identityId,
          role: 'CHEF',
        });
        const replaceUpdatedItem = (current: ChefMenuItem[] | undefined) =>
          current?.map(item => (item.id === updated.id ? updated : item));

        queryClient.setQueryData<ChefMenuItem[]>(menuQueryKey, replaceUpdatedItem);
        queryClient.setQueryData<ChefMenuItem[]>(
          dashboardMenuQueryKey,
          replaceUpdatedItem,
        );
        void queryClient.invalidateQueries({queryKey: menuQueryKey});
        void queryClient.invalidateQueries({queryKey: dashboardMenuQueryKey});
        setSubmitState('success');
        return updated;
      } catch (cause) {
        const failure = publicSubmitFailure(cause);
        setSubmitState('error');
        setErrorMessage(failure.message);
        setErrorDetails(failure.details);
        return null;
      } finally {
        activeSubmission.current = false;
      }
    },
    [identityId, queryClient],
  );

  const [deleting, setDeleting] = React.useState(false);
  const activeDelete = React.useRef(false);
  const remove = React.useCallback(
    async (item: ChefMenuItem) => {
      if (activeDelete.current || !identityId) {
        return null;
      }
      activeDelete.current = true;
      setDeleting(true);
      try {
        await chefMenuApi.deleteItem(item.id);
        const dashboardMenuQueryKey = createPrivateQueryKey('chef-dashboard-menu', {
          userId: identityId,
          role: 'CHEF',
        });
        for (const key of [createChefMenuItemsQueryKey(identityId), dashboardMenuQueryKey]) {
          queryClient.setQueryData<ChefMenuItem[]>(key, current => current?.filter(dish => dish.id !== item.id));
          void queryClient.invalidateQueries({queryKey: key});
        }
        return 'deleted' as const;
      } catch (cause) {
        return isRouteNotPublished(cause) ? ('coming-soon' as const) : ('failed' as const);
      } finally {
        activeDelete.current = false;
        setDeleting(false);
      }
    },
    [identityId, queryClient],
  );

  return {
    submitState,
    errorMessage,
    errorDetails,
    submit,
    deleting,
    remove,
    clearError: React.useCallback(() => {
      setErrorMessage(null);
      setErrorDetails([]);
      setSubmitState(current => (current === 'error' ? 'idle' : current));
    }, []),
  };
}
