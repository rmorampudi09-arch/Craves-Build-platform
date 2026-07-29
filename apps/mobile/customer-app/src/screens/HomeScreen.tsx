import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.brand}>Craves</Text>
        <Text style={styles.tagline}>food from home</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>CUSTOMER MODE</Text>
        <Text style={styles.title}>Welcome{session?.identity.displayName ? `, ${session.identity.displayName}` : ''}</Text>
        <Text style={styles.description}>Your secure Firebase phone session is active. Native provider-neutral delivery tracking is available for your chef-specific orders.</Text>
        <View style={styles.identityBox}>
          <Text style={styles.identityLabel}>Signed-in mobile</Text>
          <Text style={styles.identityValue}>{session?.identity.phoneNumber}</Text>
          <Text style={styles.identityLabel}>Roles</Text>
          <Text style={styles.identityValue}>{session?.identity.roles.join(', ')}</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('TrackingLookup')}>
          <Text style={styles.primaryText}>Track an order</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void signOut()}>
          <Text style={styles.secondaryText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background, padding: 20 },
  header: { marginTop: 16, marginBottom: 32 },
  brand: { color: theme.colors.white, fontSize: 34, fontWeight: '900' },
  tagline: { color: theme.colors.gold, fontSize: 14, marginTop: 2 },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 24 },
  eyebrow: { color: theme.colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '800', marginTop: 10 },
  description: { color: theme.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 12 },
  identityBox: { backgroundColor: theme.colors.white, borderRadius: 18, marginTop: 24, padding: 16 },
  identityLabel: { color: theme.colors.muted, fontSize: 12, fontWeight: '700', marginTop: 8 },
  identityValue: { color: theme.colors.text, fontSize: 16, fontWeight: '700', marginTop: 3 },
  primaryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, minHeight: 50, marginTop: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: theme.colors.white, fontSize: 16, fontWeight: '800' },
  secondaryButton: { borderColor: theme.colors.primary, borderRadius: theme.radius.button, borderWidth: 1, minHeight: 48, marginTop: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: theme.colors.primary, fontSize: 16, fontWeight: '800' }
});
