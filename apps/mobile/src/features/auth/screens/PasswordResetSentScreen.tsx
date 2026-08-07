import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {colors, spacing} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {AuthCard} from '../components/AuthCard';
import {AuthShell} from '../components/AuthShell';
import {PrimaryButton} from '../components/PrimaryButton';
import {PASSWORD_RECOVERY_NEUTRAL_MESSAGE} from '../domain/passwordRecoveryPolicy';
import {useAuthAttemptRole} from '../hooks/useAuthAttemptRole';

type Props = NativeStackScreenProps<RootStackParamList, 'PasswordResetSent'>;

export function PasswordResetSentScreen({navigation, route}: Props) {
  const {role} = useAuthAttemptRole(route.params.role);

  const returnToLogin = () => {
    navigation.reset({
      index: 1,
      routes: [
        {name: 'RoleSelection'},
        {
          name: 'EmailSignIn',
          params: {role, email: route.params.email},
        },
      ],
    });
  };

  return (
    <AuthShell>
      <View style={styles.top} />
      <AuthCard>
        <View style={styles.icon}>
          <Icon name="check" size={30} color={colors.flameRed} />
        </View>
        <Text style={styles.title}>Password Reset Sent</Text>
        <Text style={styles.desc}>{PASSWORD_RECOVERY_NEUTRAL_MESSAGE}</Text>
        <PrimaryButton
          label="Back to login"
          accessibilityHint={`Returns to ${role === 'CHEF' ? 'Chef' : 'Customer'} email login`}
          onPress={returnToLogin}
        />
      </AuthCard>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  top: {height: 90},
  icon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0ED',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.espressoBrown,
    textAlign: 'center',
  },
  desc: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: spacing.xl,
  },
});
