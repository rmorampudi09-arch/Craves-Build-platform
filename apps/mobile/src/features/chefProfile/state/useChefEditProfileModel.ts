import React from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useAppSelector} from '../../../app/store/hooks';
import {AppApiError} from '../../../core/http/apiError';
import {
  chefProfileApi,
  type ChefKitchenProfile,
} from '../api/chefProfileApi';
import {
  buildChefKitchenProfileReplacementRequest,
  canEditChefKitchenProfile,
} from '../domain/chefEditProfileForm';
import {useChefEditProfileDraft} from './ChefEditProfileDraftProvider';
import {
  chefProfileKitchenQueryPrefix,
  createChefProfileKitchenQueryKey,
} from './chefProfileQuery';

export interface ChefEditProfileModel {
  saveState: 'idle' | 'submitting' | 'error' | 'success';
  errorMessage: string | null;
  errorDetails: readonly string[];
  save: () => Promise<ChefKitchenProfile | null>;
  cancelSave: () => void;
  clearError: () => void;
}

function publicSaveFailure(cause: unknown): {
  message: string;
  details: readonly string[];
} {
  if (cause instanceof AppApiError) {
    return {message: cause.message, details: cause.details};
  }
  return {
    message: 'Your Chef profile could not be updated. Check the form and try again.',
    details: [],
  };
}

export function useChefEditProfileModel(): ChefEditProfileModel {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const draftSession = useChefEditProfileDraft();
  const activeSubmission = React.useRef<AbortController | null>(null);
  const [saveState, setSaveState] = React.useState<
    ChefEditProfileModel['saveState']
  >('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [errorDetails, setErrorDetails] = React.useState<readonly string[]>([]);

  const save = React.useCallback(async () => {
    if (activeSubmission.current) {
      return null;
    }
    if (!identityId) {
      setSaveState('error');
      setErrorMessage(
        'Your Chef session is unavailable. Sign in again before saving profile changes.',
      );
      setErrorDetails([]);
      return null;
    }
    if (!draftSession.originalProfile || !draftSession.formDraft) {
      setSaveState('error');
      setErrorMessage('Open the Chef profile editor again before saving changes.');
      setErrorDetails([]);
      return null;
    }
    if (!canEditChefKitchenProfile(draftSession.originalProfile)) {
      setSaveState('error');
      setErrorMessage(
        'This kitchen is suspended and its profile is read-only. Resolve the suspension before editing.',
      );
      setErrorDetails([]);
      return null;
    }

    const controller = new AbortController();
    activeSubmission.current = controller;
    setSaveState('submitting');
    setErrorMessage(null);
    setErrorDetails([]);

    try {
      const request = buildChefKitchenProfileReplacementRequest(
        draftSession.formDraft,
        draftSession.originalProfile,
      );
      const updated = await chefProfileApi.replaceKitchen(
        request,
        controller.signal,
      );
      const queryKey = createChefProfileKitchenQueryKey(identityId);

      // P98 and future Chef identity surfaces consume this canonical cache. Update
      // it immediately, then revalidate the complete Chef-profile domain so no
      // mounted surface waits for a manual refresh.
      queryClient.setQueryData<ChefKitchenProfile>(queryKey, updated);
      draftSession.commit(updated);
      void queryClient.invalidateQueries({queryKey: chefProfileKitchenQueryPrefix});
      setSaveState('success');
      return updated;
    } catch (cause) {
      if (controller.signal.aborted) {
        setSaveState('idle');
        return null;
      }
      const failure = publicSaveFailure(cause);
      setSaveState('error');
      setErrorMessage(failure.message);
      setErrorDetails(failure.details);
      return null;
    } finally {
      if (activeSubmission.current === controller) {
        activeSubmission.current = null;
      }
    }
  }, [draftSession, identityId, queryClient]);

  const cancelSave = React.useCallback(() => {
    activeSubmission.current?.abort();
  }, []);

  const clearError = React.useCallback(() => {
    setErrorMessage(null);
    setErrorDetails([]);
    setSaveState(current => (current === 'error' ? 'idle' : current));
  }, []);

  return {
    saveState,
    errorMessage,
    errorDetails,
    save,
    cancelSave,
    clearError,
  };
}
