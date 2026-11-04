import React, {type PropsWithChildren} from 'react';
import {useAppSelector} from '../../../app/store/hooks';
import {KeepItScreen} from '../screens/KeepItScreen';

/** Shows "Keep it?" in place of the app after a fresh sign-in with an open delete request, until it is answered. */
export function KeepItGate({children}: PropsWithChildren) {
  // A request that ended meanwhile (kept on the website, say) has nothing left to ask about.
  const asking = useAppSelector(state => state.auth.keepItPending && state.auth.identity?.pendingDeletion != null);
  return asking ? <KeepItScreen /> : <>{children}</>;
}
