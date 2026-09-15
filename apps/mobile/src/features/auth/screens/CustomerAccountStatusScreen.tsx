import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {AuthShell} from '../components/AuthShell';
import {AuthCard} from '../components/AuthCard';
import {Icon} from '../../../shared/components/Icon';
import {PrimaryButton} from '../components/PrimaryButton';
import {colors, spacing} from '../../../design/tokens';
import {completeLogout} from '../state/logoutCoordinator';
import {useAppDispatch} from '../../../app/store/hooks';

export function CustomerAccountStatusScreen() {
  const dispatch = useAppDispatch();
  const logout = async () => {
    await completeLogout(dispatch);
  };

  return (
    <AuthShell>
      <View style={styles.top} />
      <AuthCard>
        <View style={styles.icon}>
          <Icon name="check" size={30} color={colors.success} />
        </View>
        <Text style={styles.title}>Customer account ready</Text>
        <Text style={styles.description}>
          Your secure Craves session is ready. The customer navigation shell is active;
          marketplace content is completed in its owning implementation phases.
        </Text>
        <PrimaryButton variant="outline" label="Sign out" onPress={logout} />
      </AuthCard>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  top: {
    height: 90,
  },
  icon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successSoft,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.espressoBrown,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    color: colors.mutedText,
    marginTop: 8,
    marginBottom: spacing.lg,
  },
});
