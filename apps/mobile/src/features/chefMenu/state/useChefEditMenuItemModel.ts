import React from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {AppApiError} from '../../../core/http/apiError';
import {chefMenuApi, type ChefMenuItem} from '../api/chefMenuApi';
import {
  buildChefMenuReplacementRequest,
  type ChefMenuFormValues,
} from '../domain/chefMenuForm';
import {createChefMenuItemsQueryKey} from './chefMenuQuery';

export interface ChefEditMenuItemModel {
  submitState: 'idle' | 'submitting' | 'error' | 'success';
  errorMessage: string | null;
  errorDetails: readonly string[];
  submit: (
    values: ChefMenuFormValues,
    existingItem: ChefMenuItem,
  ) => Promise<ChefMenuItem | null>;
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
    message: 'The menu item could not be updated. Check your details and try again.',
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
    async (values: ChefMenuFormValues, existingItem: ChefMenuItem) => {
      if (activeSubmission.current) {
        return null;
      }
      if (!identityId) {
        setSubmitState('error');
        setErrorMessage(
          'Your Chef session is unavailable. Sign in again before updating an item.',
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
          buildChefMenuReplacementRequest(values, existingItem),
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

  return {
    submitState,
    errorMessage,
    errorDetails,
    submit,
    clearError: React.useCallback(() => {
      setErrorMessage(null);
      setErrorDetails([]);
      setSubmitState(current => (current === 'error' ? 'idle' : current));
    }, []),
  };
}
