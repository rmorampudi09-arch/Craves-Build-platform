import React from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {AppApiError} from '../../../core/http/apiError';
import {chefMenuApi, type ChefMenuItem} from '../api/chefMenuApi';
import {
  buildChefMenuItemRequest,
  type ChefMenuFormValues,
  type ChefMenuSubmitIntent,
} from '../domain/chefMenuForm';
import {createChefMenuItemsQueryKey} from './chefMenuQuery';

export interface ChefAddMenuItemModel {
  submitState: 'idle' | 'submitting' | 'error' | 'success';
  errorMessage: string | null;
  submit: (
    values: ChefMenuFormValues,
    intent: ChefMenuSubmitIntent,
  ) => Promise<ChefMenuItem | null>;
  clearError: () => void;
}

function publicSubmitFailure(cause: unknown): string {
  return cause instanceof AppApiError
    ? cause.message
    : 'The menu item could not be saved. Check your details and try again.';
}

export function useChefAddMenuItemModel(): ChefAddMenuItemModel {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const activeSubmission = React.useRef(false);
  const [submitState, setSubmitState] = React.useState<
    ChefAddMenuItemModel['submitState']
  >('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const submit = React.useCallback(
    async (values: ChefMenuFormValues, intent: ChefMenuSubmitIntent) => {
      if (activeSubmission.current) {
        return null;
      }
      if (!identityId) {
        setSubmitState('error');
        setErrorMessage(
          'Your Chef session is unavailable. Sign in again before saving an item.',
        );
        return null;
      }

      activeSubmission.current = true;
      setSubmitState('submitting');
      setErrorMessage(null);

      try {
        const created = await chefMenuApi.createItem(
          buildChefMenuItemRequest(values, intent),
        );
        const menuQueryKey = createChefMenuItemsQueryKey(identityId);
        const dashboardMenuQueryKey = createPrivateQueryKey('chef-dashboard-menu', {
          userId: identityId,
          role: 'CHEF',
        });
        const insertCreatedItem = (current: ChefMenuItem[] | undefined) => [
          created,
          ...(current?.filter(item => item.id !== created.id) ?? []),
        ];

        queryClient.setQueryData<ChefMenuItem[]>(menuQueryKey, insertCreatedItem);
        queryClient.setQueryData<ChefMenuItem[]>(
          dashboardMenuQueryKey,
          insertCreatedItem,
        );
        void queryClient.invalidateQueries({queryKey: menuQueryKey});
        void queryClient.invalidateQueries({queryKey: dashboardMenuQueryKey});
        setSubmitState('success');
        return created;
      } catch (cause) {
        setSubmitState('error');
        setErrorMessage(publicSubmitFailure(cause));
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
    submit,
    clearError: React.useCallback(() => {
      setErrorMessage(null);
      setSubmitState(current => (current === 'error' ? 'idle' : current));
    }, []),
  };
}
