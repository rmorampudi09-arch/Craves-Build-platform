import React, {useRef, useState} from 'react';
import {useAppDispatch} from '../../../app/store/hooks';
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {AuthShell} from '../components/AuthShell';
import {authService} from '../state/authService';
import {authActions} from '../state/authSlice';

/** Shown when the saved session can't be restored at launch: retry, or clear it and sign in again. */
export function StartupErrorScreen() {
  const dispatch = useAppDispatch();
  const [leavingRestore, setLeavingRestore] = useState(false);
  const leaving = useRef(false);

  const handleSignIn = async () => {
    if (leaving.current) {
      return;
    }
    leaving.current = true;
    setLeavingRestore(true);
    await authService.discardRestoredSession();
    dispatch(authActions.signedOut());
  };

  return (
    <AuthShell>
      <TerminalState
        illustration="session"
        title="We couldn't sign you back in"
        description="Check your connection and try again. You can also sign in again with your phone number."
        actionLabel="Try again"
        onAction={() => {
          if (!leaving.current) {
            dispatch(authActions.bootstrapReset());
          }
        }}
        secondaryActionLabel={leavingRestore ? 'Signing you out…' : 'Go to sign in'}
        onSecondaryAction={() => {
          handleSignIn().catch(() => undefined);
        }}
        testID="startup-error"
      />
    </AuthShell>
  );
}
