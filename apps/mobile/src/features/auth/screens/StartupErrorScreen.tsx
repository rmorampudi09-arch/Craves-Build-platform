import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useAppDispatch} from '../../../app/store/hooks';
import {colors, spacing} from '../../../design/tokens';
import {AuthCard} from '../components/AuthCard';
import {AuthShell} from '../components/AuthShell';
import {PrimaryButton} from '../components/PrimaryButton';
import {authService} from '../state/authService';
import {authActions} from '../state/authSlice';

export function StartupErrorScreen() {
  const dispatch = useAppDispatch();
  const [leavingRestore, setLeavingRestore] = useState(false);

  const handleSignIn = async () => {
    if (leavingRestore) {
      return;
    }
    setLeavingRestore(true);
    await authService.discardRestoredSession();
    dispatch(authActions.signedOut());
  };

  return (
    <AuthShell>
      <View style={styles.top} />
      <AuthCard>
        <Text style={styles.title}>We couldn't restore your session</Text>
        <Text style={styles.description}>
          Check your connection and try again. If you prefer, you can securely clear the saved session and sign in again.
        </Text>
        <PrimaryButton
          label="Try again"
          disabled={leavingRestore}
          onPress={() => dispatch(authActions.bootstrapReset())}
        />
        <PrimaryButton
          variant="outline"
          label="Go to sign in"
          loading={leavingRestore}
          onPress={handleSignIn}
        />
      </AuthCard>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  top: {height: 90},
  title: {fontSize: 22, fontWeight: '700', color: colors.espressoBrown},
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
