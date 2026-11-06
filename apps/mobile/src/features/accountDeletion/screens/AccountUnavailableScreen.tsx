import React, {useRef} from 'react';
import {Linking, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useAppDispatch} from '../../../app/store/hooks';
import {colors} from '../../../design/tokens';
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {authService} from '../../auth/state/authService';
import {authActions} from '../../auth/state/authSlice';
import {CRAVES_SUPPORT_PHONE} from '../../customerSupport/domain/supportContact';
import {deletionCopy} from '../domain/deletionCopy';

const {unavailable: copy} = deletionCopy;

/**
 * A sign-in the server refused because the account is inactive: erased, or suspended by Craves staff.
 * `signedIn` is false on the OTP and email screens, where nobody is signed in yet, so the way out is Back.
 */
export function AccountUnavailableScreen({signedIn}: {signedIn: boolean}) {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const signingOut = useRef(false);

  const signOut = async () => {
    if (signingOut.current) {
      return;
    }
    signingOut.current = true;
    await authService.logout();
    dispatch(authActions.signedOut());
  };

  return (
    <TerminalState
      title={copy.title}
      description={copy.body}
      // shortcut: the server's support number is only readable while signed in; fetch it once a public support endpoint exists.
      actionLabel={copy.support}
      onAction={() => Linking.openURL(`tel:${CRAVES_SUPPORT_PHONE}`).catch(() => undefined)}
      secondaryActionLabel={signedIn ? copy.signOut : copy.back}
      onSecondaryAction={signedIn ? signOut : () => navigation.goBack()}
      style={styles.page}
    />
  );
}

const styles = StyleSheet.create({
  page: {backgroundColor: colors.white},
});
