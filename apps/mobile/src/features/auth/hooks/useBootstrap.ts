import {useEffect} from 'react';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {authActions} from '../state/authSlice';
import {authService} from '../state/authService';
import {toAppApiError} from '../../../core/http/apiError';
import {activeRoleStorage} from '../storage/activeRoleStorage';

export function useBootstrap() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(state => state.auth.bootstrapStatus);

  useEffect(() => {
    if (status !== 'idle') return;

    dispatch(authActions.bootstrapStarted());
    authService
      .restore()
      .then(async tokens => {
        if (tokens?.identity) {
          const role = await activeRoleStorage.read(tokens.identity.id);
          // The account router still verifies this intent against the live backend.
          if (role) dispatch(authActions.roleSelected(role));
          dispatch(authActions.authenticated(tokens.identity));
        } else dispatch(authActions.bootstrapAnonymous());
      })
      .catch(error => {
        dispatch(authActions.bootstrapFailed(toAppApiError(error).code));
      });
  }, [dispatch, status]);

  return status;
}
