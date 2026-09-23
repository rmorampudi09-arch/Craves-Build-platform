import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, spacing, typography} from '../../../design/tokens';
import {RecoverableErrorBanner} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import type {RazorpayHostedHandoff} from '../domain/paymentTypes';
import {razorpayGateway} from '../gateway/razorpayGateway';

const handoff: RazorpayHostedHandoff = {
  provider: 'RAZORPAY',
  paymentOrderId: '55555555-5555-4555-8555-555555555555',
  checkoutId: '11111111-1111-4111-8111-111111111111',
  providerOrderId: 'order_craves_ios_e2e_unavailable',
  checkoutKeyId: 'rzp_test_craves_ios_e2e',
  amount: {amount: '1.00', currency: 'INR'},
};

export function PaymentProviderUnavailableE2EScreen() {
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    razorpayGateway
      .open(handoff)
      .then(() => {
        if (active) {
          setMessage(
            'Payment safety check failed because checkout unexpectedly completed.',
          );
        }
      })
      .catch(error => {
        if (!active) return;
        const errorCode =
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : 'UNKNOWN';
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.info(
            `E2E_PAYMENT_PROVIDER_UNAVAILABLE_VISIBLE:${errorCode}`,
          );
        }
        setMessage(
          error instanceof Error
            ? error.message
            : 'Checkout could not be started.',
        );
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScreenShell edges={['top', 'bottom']} testID="payment-provider-unavailable-e2e">
      <View style={styles.content}>
        <Text style={styles.title}>Payment could not start</Text>
        <Text style={styles.description}>
          Craves keeps the order unpaid when secure checkout is unavailable.
        </Text>
        {message ? (
          <RecoverableErrorBanner message={message} />
        ) : (
          <ActivityIndicator color={colors.flameRed} size="large" />
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surfaceBase,
  },
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.body,
  },
});
