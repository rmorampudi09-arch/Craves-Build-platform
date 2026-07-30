import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MobileCheckout'>;

export function CheckoutPreparationScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>CHECKOUT MODULE BOUNDARY</Text>
        <Text style={styles.title}>Your cart is ready.</Text>
        <Text style={styles.body}>The next stacked module replaces this safe preparation screen with saved-address selection, backend checkout creation and Cashfree payment. No cart item or total is changed here.</Text>
        <Pressable style={styles.primary} onPress={() => navigation.navigate('Addresses')}><Text style={styles.primaryText}>Review saved addresses</Text></Pressable>
        <Pressable style={styles.outline} onPress={() => navigation.goBack()}><Text style={styles.outlineText}>Return to cart</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', backgroundColor: theme.colors.background, flex: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: theme.colors.card, borderRadius: 28, padding: 24 },
  eyebrow: { color: theme.colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '900', marginTop: 10 },
  body: { color: theme.colors.muted, lineHeight: 22, marginTop: 14 },
  primary: { alignItems: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, justifyContent: 'center', marginTop: 24, minHeight: 50 },
  primaryText: { color: theme.colors.white, fontWeight: '900' },
  outline: { alignItems: 'center', borderColor: theme.colors.primary, borderRadius: theme.radius.button, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 48 },
  outlineText: { color: theme.colors.primary, fontWeight: '900' }
});
