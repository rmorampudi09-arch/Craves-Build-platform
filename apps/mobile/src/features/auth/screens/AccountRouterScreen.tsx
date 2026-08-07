import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, spacing} from '../../../design/tokens';
import {PrimaryButton} from '../components/PrimaryButton';
import {accountResolutionService} from '../state/accountResolutionService';
import {authService} from '../state/authService';
import {authActions} from '../state/authSlice';

export function AccountRouterScreen() {
  const dispatch = useAppDispatch();
  const requestedRole = useAppSelector(state => state.auth.selectedRole);
  const mounted = useRef(true);
  const requestInFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        setError(toAppApiError(caught).message);
      }
    } finally {
      requestInFlight.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  }, [dispatch, requestedRole]);

  useEffect(() => {
    resolveAccount();
  }, [resolveAccount]);

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

  return (
    <View style={styles.root}>
      {busy ? <ActivityIndicator color={colors.flameRed} size="large" /> : null}
      <Text style={styles.title}>
        {error ? 'We could not verify your account' : 'Checking your Craves account…'}
      </Text>
      <Text style={styles.text}>
        {error ??
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
    backgroundColor: colors.cream,
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
