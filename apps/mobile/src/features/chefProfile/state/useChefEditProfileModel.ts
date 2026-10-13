import React from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useAppSelector} from '../../../app/store/hooks';
import {chefProfileApi, type ChefKitchenProfile} from '../api/chefProfileApi';
import {buildChefKitchenProfileReplacementRequest, canEditChefKitchenProfile} from '../domain/chefEditProfileForm';
import {useChefEditProfileDraft} from './ChefEditProfileDraftProvider';
import {createChefProfileKitchenQueryKey} from './chefProfileQuery';
import {synchronizeChefProfileAfterSave} from './chefProfileSynchronization';

export const KITCHEN_SAVE_FAILED = "We couldn't save your changes. Please try again.";
export const KITCHEN_PAUSED_BY_CRAVES = 'Craves has paused your kitchen, so its details cannot be changed right now.';

export interface ChefEditProfileModel {
  saveState: 'idle' | 'submitting' | 'error' | 'success';
  /** Plain words for the chef; never the server's own text. */
  errorMessage: string | null;
  save: () => Promise<ChefKitchenProfile | null>;
  cancelSave: () => void;
  clearError: () => void;
}

export function useChefEditProfileModel(): ChefEditProfileModel {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const draftSession = useChefEditProfileDraft();
  const activeSubmission = React.useRef<AbortController | null>(null);
  const [saveState, setSaveState] = React.useState<ChefEditProfileModel['saveState']>('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const fail = React.useCallback((message: string) => {
    setSaveState('error');
    setErrorMessage(message);
    return null;
  }, []);

  const save = React.useCallback(async () => {
    if (activeSubmission.current) {
      return null;
    }
    if (!identityId || !draftSession.originalProfile || !draftSession.formDraft) {
      return fail(KITCHEN_SAVE_FAILED);
    }
    const form = draftSession.formDraft;

    const controller = new AbortController();
    activeSubmission.current = controller;
    setSaveState('submitting');
    setErrorMessage(null);

    try {
      // The PUT replaces the whole kitchen, status and pin included, so it is built on the kitchen as it is
      // right now: the chef may have closed it on Home, or Craves may have paused it, since this form opened.
      const latest = await queryClient.fetchQuery({
        queryKey: createChefProfileKitchenQueryKey(identityId),
        queryFn: () => chefProfileApi.getKitchen(controller.signal),
        staleTime: 0,
      });
      if (!canEditChefKitchenProfile(latest)) {
        return fail(KITCHEN_PAUSED_BY_CRAVES);
      }
      const updated = await chefProfileApi.replaceKitchen(
        buildChefKitchenProfileReplacementRequest(form, latest),
        controller.signal,
      );

      draftSession.commit(updated);
      void synchronizeChefProfileAfterSave(queryClient, identityId, updated);
      setSaveState('success');
      return updated;
    } catch {
      if (controller.signal.aborted) {
        setSaveState('idle');
        return null;
      }
      return fail(KITCHEN_SAVE_FAILED);
    } finally {
      if (activeSubmission.current === controller) {
        activeSubmission.current = null;
      }
    }
  }, [draftSession, fail, identityId, queryClient]);

  const cancelSave = React.useCallback(() => {
    activeSubmission.current?.abort();
  }, []);

  const clearError = React.useCallback(() => {
    setErrorMessage(null);
    setSaveState(current => (current === 'error' ? 'idle' : current));
  }, []);

  return {saveState, errorMessage, save, cancelSave, clearError};
}
