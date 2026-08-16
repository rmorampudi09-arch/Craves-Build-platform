import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  PaymentRecoveryReference,
  RazorpayHostedHandoff,
} from '../domain/paymentTypes';

const STORAGE_KEY = '@craves/payment/pending-attempt/v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

interface StoredPendingPaymentAttempt extends PaymentRecoveryReference {
  version: 1;
  savedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function parseStoredAttempt(value: unknown): StoredPendingPaymentAttempt | null {
  const record = asRecord(value);
  const money = asRecord(record?.amount);
  if (!record || record.version !== 1 || !money) return null;

  const paymentOrderId = boundedString(record.paymentOrderId, 64);
  const checkoutId = boundedString(record.checkoutId, 64);
  const providerOrderId = boundedString(record.providerOrderId, 180);
  const amount = boundedString(money.amount, 64);
  const currency = boundedString(money.currency, 3);
  const savedAt = boundedString(record.savedAt, 64);

  if (
    !paymentOrderId ||
    !UUID_PATTERN.test(paymentOrderId) ||
    !checkoutId ||
    !UUID_PATTERN.test(checkoutId) ||
    !providerOrderId ||
    !amount ||
    !DECIMAL_PATTERN.test(amount) ||
    !currency ||
    !CURRENCY_PATTERN.test(currency) ||
    !savedAt ||
    Number.isNaN(Date.parse(savedAt))
  ) {
    return null;
  }

  return {
    version: 1,
    paymentOrderId,
    checkoutId,
    providerOrderId,
    amount: {amount, currency},
    savedAt,
  };
}

async function clearInvalidStoredAttempt(): Promise<null> {
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  return null;
}

export const pendingPaymentAttemptStore = {
  async save(handoff: RazorpayHostedHandoff): Promise<void> {
    const stored: StoredPendingPaymentAttempt = {
      version: 1,
      paymentOrderId: handoff.paymentOrderId,
      checkoutId: handoff.checkoutId,
      providerOrderId: handoff.providerOrderId,
      amount: handoff.amount,
      savedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  },

  async load(): Promise<PaymentRecoveryReference | null> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
      const stored = parseStoredAttempt(JSON.parse(raw));
      if (!stored) return clearInvalidStoredAttempt();
      return {
        paymentOrderId: stored.paymentOrderId,
        checkoutId: stored.checkoutId,
        providerOrderId: stored.providerOrderId,
        amount: stored.amount,
      };
    } catch {
      return clearInvalidStoredAttempt();
    }
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
};
