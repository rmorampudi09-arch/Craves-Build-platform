import type {PaymentRecoveryResult} from './paymentRecoveryCoordinator';
import {paymentRecoveryCoordinator} from './paymentRecoveryCoordinator';
import {pendingPaymentAttemptStore} from '../storage/pendingPaymentAttemptStore';

function canForgetAttempt(result: PaymentRecoveryResult): boolean {
  return (
    result.outcome === 'SUCCEEDED' ||
    result.outcome === 'FAILED' ||
    result.outcome === 'CANCELLED'
  );
}

/**
 * Reconciles any payment that survived an app/process interruption.
 * Network/auth failures intentionally propagate without clearing local state,
 * so callers fail closed instead of creating a potentially duplicate payment.
 */
export async function recoverPersistedPaymentAttempt(): Promise<PaymentRecoveryResult | null> {
  const attempt = await pendingPaymentAttemptStore.load();
  if (!attempt) return null;

  const result = await paymentRecoveryCoordinator.recover(attempt, {kind: 'APP_RESUME'});
  if (canForgetAttempt(result)) await pendingPaymentAttemptStore.clear();
  return result;
}

export async function clearPersistedPaymentIfTerminal(
  result: PaymentRecoveryResult,
): Promise<void> {
  if (canForgetAttempt(result)) await pendingPaymentAttemptStore.clear();
}
