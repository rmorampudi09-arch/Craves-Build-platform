import {useEffect} from 'react';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {authActions} from '../state/authSlice';
import {authService} from '../state/authService';
import {toAppApiError} from '../../../core/http/apiError';

export function useBootstrap() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(state => state.auth.bootstrapStatus);
  useEffect(() => {
    if (status !== 'idle') return;
    let active = true;
    dispatch(authActions.bootstrapStarted());
    authService.restore()
      .then(tokens => {
        if (!active) return;
        if (tokens?.identity) dispatch(authActions.authenticated(tokens.identity));
        else dispatch(authActions.bootstrapAnonymous());
      })
      .catch(error => {
        if (!active) return;
        dispatch(authActions.bootstrapFailed(toAppApiError(error).code));
      });
    return () => { active = false; };
  }, [dispatch, status]);
  return status;
}
