export type SubscriptionPaymentStatus =
  | "PAYMENT_REQUESTED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "FAILED";

export type SubscriptionPayment = {
  id: string;
  invoiceId: string;
  subscriptionId: string;
  cycleStart: string;
  cycleEnd: string;
  amount: number;
  currency: string;
  status: SubscriptionPaymentStatus;
  paymentSessionId: string | null;
  providerStatus: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const STATUSES = new Set<SubscriptionPaymentStatus>([
  "PAYMENT_REQUESTED",
  "PAYMENT_PENDING",
  "PAID",
  "FAILED",
]);

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

function optionalText(value: unknown, max: number): string | null {
  return value == null || value === "" ? null : text(value, max);
}

function instant(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function parseSubscriptionPayment(value: unknown): SubscriptionPayment | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 64);
  const invoiceId = text(raw.invoiceId, 64);
  const subscriptionId = text(raw.subscriptionId, 64);
  const cycleStart = text(raw.cycleStart, 10);
  const cycleEnd = text(raw.cycleEnd, 10);
  const currency = text(raw.currency, 3)?.toUpperCase() ?? null;
  const status = text(raw.status, 40) as SubscriptionPaymentStatus | null;
  const amount = typeof raw.amount === "number" ? raw.amount : Number(raw.amount);
  const createdAt = instant(raw.createdAt);
  const updatedAt = instant(raw.updatedAt);
  const paidAt = raw.paidAt == null ? null : instant(raw.paidAt);

  if (
    !id || !UUID.test(id) ||
    !invoiceId || !UUID.test(invoiceId) ||
    !subscriptionId || !UUID.test(subscriptionId) ||
    !cycleStart || !DATE_ONLY.test(cycleStart) ||
    !cycleEnd || !DATE_ONLY.test(cycleEnd) || cycleEnd <= cycleStart ||
    !Number.isFinite(amount) || amount <= 0 ||
    !currency || !CURRENCY.test(currency) ||
    !status || !STATUSES.has(status) ||
    !createdAt || !updatedAt ||
    (raw.paidAt != null && !paidAt)
  ) {
    return null;
  }

  return {
    id,
    invoiceId,
    subscriptionId,
    cycleStart,
    cycleEnd,
    amount,
    currency,
    status,
    paymentSessionId: optionalText(raw.paymentSessionId, 2048),
    providerStatus: optionalText(raw.providerStatus, 120),
    createdAt,
    updatedAt,
    paidAt,
  };
}
