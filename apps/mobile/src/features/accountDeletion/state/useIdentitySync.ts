import {useEffect} from 'react';
import {useStore} from 'react-redux';
import {useAppDispatch} from '../../../app/store/hooks';
import type {RootState} from '../../../app/store/store';
import {sessionManager} from '../../auth/api/sessionManager';
import {authActions} from '../../auth/state/authSlice';
import {switchChefToCustomerRole} from '../../chefProfile/state/chefProfileRoleSwitch';

/** Keeps the signed-in identity current on every token rotation, and moves the person off a role they lost. */
export function useIdentitySync(): void {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  useEffect(
    () =>
      sessionManager.onTokensRotated(({identity}) => {
        dispatch(authActions.identityRefreshed(identity));
        const flow = store.getState().auth.accountResolution?.flow;
        const hasCustomer = identity.roles.includes('CUSTOMER');
        const hasChef = identity.roles.includes('CHEF');
        if (flow === 'CUSTOMER' && !hasCustomer && hasChef) {
          dispatch(authActions.roleSelected('CHEF'));
        } else if (flow === 'CHEF' && !hasChef) {
          // Purges Chef-private data first; if that fails the person stays in the Chef root.
          switchChefToCustomerRole(dispatch).catch(() => undefined);
        }
      }),
    [dispatch, store],
  );
}
