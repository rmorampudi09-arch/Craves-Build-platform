import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../app/navigation/types';
import { colors } from '../../../design/tokens';
import { VideoAuthLayout } from '../components/VideoAuthLayout';
import { AuthActionButton } from '../components/AuthActionButton';
import { AuthRoleCards } from '../components/AuthRoleCards';
import { useAuthAttemptRole } from '../hooks/useAuthAttemptRole';
import { authTransitionMemory } from '../state/authTransitionMemory';

type Props = NativeStackScreenProps<RootStackParamList, 'RoleSelection'>;

export function RoleSelectionScreen({ navigation }: Props) {
  const { role, selectRole } = useAuthAttemptRole();

  const continueToSignIn = () => {
    authTransitionMemory.clear();
    navigation.navigate('PhoneSignIn', { role });
  };

  return (
    <VideoAuthLayout welcome>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to Craves</Text>
        <Text style={styles.subtitle}>How would you like to continue?</Text>
      </View>
      <AuthRoleCards value={role} onChange={selectRole} welcome />
      <AuthActionButton
        label={
          role === 'CUSTOMER' ? 'Continue as Customer' : 'Continue as Chef'
        }
        onPress={continueToSignIn}
      />
    </VideoAuthLayout>
  );
}

const styles = StyleSheet.create({
  content: { gap: 2 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: colors.mutedText,
    textAlign: 'center',
  },
});
