import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError, type AppApiError} from '../../../core/http/apiError';
import {colors, spacing} from '../../../design/tokens';
import {deletionCopy} from '../../accountDeletion/domain/deletionCopy';
import {AccountUnavailableScreen} from '../../accountDeletion/screens/AccountUnavailableScreen';
import {PrimaryButton} from '../components/PrimaryButton';
import {accountResolutionService} from '../state/accountResolutionService';
import {authService} from '../state/authService';
import {authActions} from '../state/authSlice';

export function AccountRouterScreen() {
  const dispatch = useAppDispatch();
  const requestedRole = useAppSelector(state => state.auth.selectedRole);
  const pendingDeletion = useAppSelector(state => state.auth.identity?.pendingDeletion);
  const roles = useAppSelector(state => state.auth.identity?.roles);
  // A restored session can still ask for CUSTOMER after the customer side was deleted; a chef keeps CHEF.
  const customerRoleLost =
    requestedRole === 'CUSTOMER' && roles?.includes('CHEF') === true && !roles.includes('CUSTOMER');
  // Chef mode has nothing to open while the chef side is erased; the customer side still works.
  const chefSideErasing =
    requestedRole === 'CHEF' && pendingDeletion?.scope === 'CHEF' && pendingDeletion.status === 'ERASING';
  const mounted = useRef(true);
  const requestInFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppApiError | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const resolveAccount = useCallback(async () => {
    if (requestInFlight.current) {
      return;
    }

    requestInFlight.current = true;
    setBusy(true);
    setError(null);

    try {
      const result = await accountResolutionService.resolve(requestedRole);
      if (mounted.current) {
        dispatch(authActions.accountResolved(result));
      }
    } catch (caught) {
      if (mounted.current) {
        setError(toAppApiError(caught));
      }
    } finally {
      requestInFlight.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  }, [dispatch, requestedRole]);

  useEffect(() => {
    if (customerRoleLost) {
      dispatch(authActions.roleSelected('CHEF'));
    } else if (!chefSideErasing) {
      resolveAccount();
    }
  }, [dispatch, resolveAccount, chefSideErasing, customerRoleLost]);

  const signOut = async () => {
    if (signingOut || requestInFlight.current) {
      return;
    }

    setSigningOut(true);
    try {
      await authService.logout();
      if (mounted.current) {
        dispatch(authActions.signedOut());
      }
    } finally {
      if (mounted.current) {
        setSigningOut(false);
      }
    }
  };

  if (chefSideErasing) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>{deletionCopy.state.erasingTitle.CHEF}</Text>
        <Text style={styles.text}>{deletionCopy.state.erasingBody}</Text>
        <View style={styles.actions}>
          <PrimaryButton
            label={deletionCopy.state.goToCustomerSide}
            onPress={() => dispatch(authActions.roleSelected('CUSTOMER'))}
          />
        </View>
      </View>
    );
  }

  if (error?.code === 'IDENTITY_NOT_ACTIVE') {
    return <AccountUnavailableScreen signedIn />;
  }

  return (
    <View style={styles.root}>
      {busy ? <ActivityIndicator color={colors.flameRed} size="large" /> : null}
      <Text style={styles.title}>
        {error ? 'We could not verify your account' : 'Checking your Craves account…'}
      </Text>
      <Text style={styles.text}>
        {error?.message ??
          'We are securely confirming your account role and onboarding status.'}
      </Text>
      {error ? (
        <View style={styles.actions}>
          <PrimaryButton
            label="Try again"
            disabled={busy || signingOut}
            loading={busy}
            onPress={resolveAccount}
          />
          <PrimaryButton
            variant="outline"
            label="Sign out"
            disabled={busy || signingOut}
            loading={signingOut}
            onPress={signOut}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    padding: spacing.xl,
  },
  title: {
    marginTop: spacing.md,
    fontSize: 18,
    fontWeight: '700',
    color: colors.espressoBrown,
    textAlign: 'center',
  },
  text: {
    marginTop: spacing.sm,
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
});
