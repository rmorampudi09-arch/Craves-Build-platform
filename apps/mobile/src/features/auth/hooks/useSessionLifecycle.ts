import {useEffect} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {tokenMemory} from '../../../core/security/tokenMemory';
import {sessionManager} from '../api/sessionManager';
import {authActions} from '../state/authSlice';

const RETRY_DELAY_MS = 60_000;
const MIN_TIMER_DELAY_MS = 250;

export function useSessionLifecycle(): void {
  const dispatch = useAppDispatch();
  const status = useAppSelector(state => state.auth.bootstrapStatus);

  useEffect(() => sessionManager.subscribeInvalidation(() => {
    dispatch(authActions.signedOut());
  }), [dispatch]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    let mounted = true;
    let appState: AppStateStatus = AppState.currentState;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function clearTimer() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function schedule(overrideDelayMs?: number) {
      if (!mounted || appState !== 'active') return;
      clearTimer();
      const dueInMs = tokenMemory.millisecondsUntilRefresh();
      if (dueInMs === null) {
        dispatch(authActions.signedOut());
        return;
      }
      timer = setTimeout(() => {
        runRefresh();
      }, Math.max(MIN_TIMER_DELAY_MS, overrideDelayMs ?? dueInMs));
    }

    async function runRefresh() {
      if (!mounted || appState !== 'active') return;
      clearTimer();
      try {
        const tokens = await sessionManager.refresh();
        if (!mounted) return;
        if (!tokens) {
          dispatch(authActions.signedOut());
          return;
        }
        schedule();
      } catch (error) {
        if (!mounted) return;
        const normalized = toAppApiError(error);
        if (normalized.retriable || !normalized.status || normalized.status >= 500) {
          schedule(RETRY_DELAY_MS);
          return;
        }
        dispatch(authActions.signedOut());
      }
    }

    schedule();
    const subscription = AppState.addEventListener('change', nextState => {
      const wasInactive = appState !== 'active';
      appState = nextState;
      if (nextState !== 'active') {
        clearTimer();
        return;
      }
      if (!wasInactive) return;
      if (tokenMemory.isFresh()) schedule();
      else runRefresh();
    });

    return () => {
      mounted = false;
      clearTimer();
      subscription.remove();
    };
  }, [dispatch, status]);
}
