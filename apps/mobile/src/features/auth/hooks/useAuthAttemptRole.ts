import {useCallback, useEffect, useState} from 'react';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import type {AuthRole} from '../domain/types';
import {authActions} from '../state/authSlice';

export interface AuthAttemptRoleState {
  role: AuthRole;
  selectRole: (role: AuthRole) => void;
}

/**
 * Keeps the Customer/Chef choice consistent for the current in-memory auth
 * attempt. A role supplied by a typed auth route becomes authoritative on entry,
 * while user changes update both the visible selector and the shared auth store.
 * The choice is intentionally not persisted to general-purpose storage.
 */
export function useAuthAttemptRole(routeRole?: AuthRole): AuthAttemptRoleState {
  const dispatch = useAppDispatch();
  const selectedRole = useAppSelector(state => state.auth.selectedRole);
  const [role, setRole] = useState<AuthRole>(() => routeRole ?? selectedRole);

  useEffect(() => {
    if (routeRole === undefined) {
      return;
    }

    setRole(routeRole);
    dispatch(authActions.roleSelected(routeRole));
  }, [dispatch, routeRole]);

  const selectRole = useCallback(
    (nextRole: AuthRole) => {
      setRole(nextRole);
      dispatch(authActions.roleSelected(nextRole));
    },
    [dispatch],
  );

  return {role, selectRole};
}
