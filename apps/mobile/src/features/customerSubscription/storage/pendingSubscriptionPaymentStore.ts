import AsyncStorage from '@react-native-async-storage/async-storage';
import type {PaymentMoney} from '../../payment/domain/paymentTypes';

const STORAGE_KEY = '@craves/subscription-payment/pending-attempt/v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RAZORPAY_ORDER_PATTERN = /^order_[A-Za-z0-9]+$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export interface PendingSubscriptionPaymentReference {
  invoiceId: string;
  subscriptionId: string;
  providerOrderId: string;
  amount: PaymentMoney;
}

interface StoredPendingSubscriptionPayment extends PendingSubscriptionPaymentReference {
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

function parseStoredAttempt(value: unknown): StoredPendingSubscriptionPayment | null {
  const record = asRecord(value);
  const money = asRecord(record?.amount);
  if (!record || record.version !== 1 || !money) return null;

  const invoiceId = boundedString(record.invoiceId, 64);
  const subscriptionId = boundedString(record.subscriptionId, 64);
  const providerOrderId = boundedString(record.providerOrderId, 180);
  const amount = boundedString(money.amount, 64);
  const currency = boundedString(money.currency, 3);
  const savedAt = boundedString(record.savedAt, 64);

  if (
    !invoiceId ||
    !UUID_PATTERN.test(invoiceId) ||
    !subscriptionId ||
    !UUID_PATTERN.test(subscriptionId) ||
    !providerOrderId ||
    !RAZORPAY_ORDER_PATTERN.test(providerOrderId) ||
    !amount ||
    !DECIMAL_PATTERN.test(amount) ||
    Number(amount) <= 0 ||
    !currency ||
    !CURRENCY_PATTERN.test(currency) ||
    !savedAt ||
    Number.isNaN(Date.parse(savedAt))
  ) {
    return null;
  }

  return {
    version: 1,
    invoiceId,
    subscriptionId,
    providerOrderId,
    amount: {amount, currency},
    savedAt,
  };
}

async function clearInvalidStoredAttempt(): Promise<null> {
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  return null;
}

export const pendingSubscriptionPaymentStore = {
  async save(reference: PendingSubscriptionPaymentReference): Promise<void> {
    const stored: StoredPendingSubscriptionPayment = {
      version: 1,
      invoiceId: reference.invoiceId,
      subscriptionId: reference.subscriptionId,
      providerOrderId: reference.providerOrderId,
      amount: reference.amount,
      savedAt: new Date().toISOString(),
    };
    if (!parseStoredAttempt(stored)) {
      throw new Error('Invalid subscription payment recovery reference.');
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  },

  async load(): Promise<PendingSubscriptionPaymentReference | null> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
      const stored = parseStoredAttempt(JSON.parse(raw));
      if (!stored) return clearInvalidStoredAttempt();
      return {
        invoiceId: stored.invoiceId,
        subscriptionId: stored.subscriptionId,
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
