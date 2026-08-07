import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {colors, spacing} from '../../../design/tokens';
import {AuthHero} from '../components/AuthHero';
import {AuthShell} from '../components/AuthShell';
import {PrimaryButton} from '../components/PrimaryButton';
import {RoleSelector} from '../components/RoleSelector';
import {SecurityNote} from '../components/SecurityNote';
import {useAuthAttemptRole} from '../hooks/useAuthAttemptRole';

type Props = NativeStackScreenProps<RootStackParamList, 'RoleSelection'>;

export function RoleSelectionScreen({navigation}: Props) {
  const {role, selectRole} = useAuthAttemptRole();

  const continueToSignIn = () => {
    navigation.navigate('PhoneSignIn', {role});
  };

  return (
    <AuthShell>
      <AuthHero role={role} />
      <RoleSelector value={role} onChange={selectRole} />
      <View style={styles.content}>
        <Text style={styles.title}>How would you like to use Craves?</Text>
        <Text style={styles.subtitle}>
          {role === 'CUSTOMER'
            ? 'Discover homemade food from trusted local chefs.'
            : 'Access your approved chef account and manage your kitchen.'}
        </Text>
        <PrimaryButton
          label={role === 'CUSTOMER' ? 'Continue as Customer' : 'Continue as Chef'}
          onPress={continueToSignIn}
        />
        <SecurityNote />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  content: {paddingHorizontal: spacing.xl, paddingTop: spacing.lg},
  title: {fontSize: 22, fontWeight: '700', color: colors.espressoBrown},
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
    marginTop: 7,
    marginBottom: spacing.xl,
  },
});
