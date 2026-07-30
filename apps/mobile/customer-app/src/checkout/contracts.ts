export type MobileCheckout = {
  id: string;
  status: 'PAYMENT_PENDING' | 'PAID' | 'CANCELLED';
  currency: string;
  foodSubtotal: number;
  platformFee: number;
  taxAmount: number;
  deliveryFee: number;
  grandTotal: number;
  deliveryAddressId: string | null;
  orders: Array<{ id: string; kitchenName: string; status: string; grandTotal: number }>;
};

export type MobilePaymentSession = {
  paymentOrderId: string;
  checkoutId: string;
  cashfreeOrderId: string;
  paymentSessionId: string;
  amount: number;
  currency: string;
  status: 'CREATED' | 'PAYMENT_PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
};

export type MobilePaymentVerification = {
  paymentOrderId: string;
  status: MobilePaymentSession['status'];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKOUT_STATUSES = new Set(['PAYMENT_PENDING', 'PAID', 'CANCELLED']);
const PAYMENT_STATUSES = new Set(['CREATED', 'PAYMENT_PENDING', 'PAID', 'FAILED', 'CANCELLED']);
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown, max: number): string | null { if (typeof value !== 'string') return null; const result = value.trim(); return result && result.length <= max ? result : null; }
function uuid(value: unknown): string | null { const result = text(value, 64); return result && UUID.test(result) ? result : null; }
function money(value: unknown): number | null { const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN; return Number.isFinite(result) && result >= 0 && result <= 10_000_000 ? result : null; }

export function parseCheckout(value: unknown): MobileCheckout | null {
  const raw = record(value); if (!raw || !Array.isArray(raw.orders) || raw.orders.length > 100) return null;
  const id = uuid(raw.id); const status = text(raw.status, 30); const currency = text(raw.currency, 3); const deliveryAddressId = raw.deliveryAddressId == null ? null : uuid(raw.deliveryAddressId); const amounts = [raw.foodSubtotal, raw.platformFee, raw.taxAmount, raw.deliveryFee, raw.grandTotal].map(money);
  const orders = raw.orders.map(orderValue => { const order = record(orderValue); if (!order) return null; const orderId = uuid(order.id); const kitchenName = text(order.kitchenName, 180); const orderStatus = text(order.status, 40); const orderTotal = money(order.grandTotal); return orderId && kitchenName && orderStatus && orderTotal !== null ? { id: orderId, kitchenName, status: orderStatus, grandTotal: orderTotal } : null; });
  if (!id || !status || !CHECKOUT_STATUSES.has(status) || !currency || (raw.deliveryAddressId != null && !deliveryAddressId) || amounts.some(amount => amount === null) || orders.some(order => order === null)) return null;
  return { id, status: status as MobileCheckout['status'], currency: currency.toUpperCase(), foodSubtotal: amounts[0]!, platformFee: amounts[1]!, taxAmount: amounts[2]!, deliveryFee: amounts[3]!, grandTotal: amounts[4]!, deliveryAddressId, orders: orders as MobileCheckout['orders'] };
}

export function parsePaymentSession(value: unknown): MobilePaymentSession | null {
  const raw = record(value); if (!raw) return null;
  const paymentOrderId = uuid(raw.paymentOrderId); const checkoutId = uuid(raw.checkoutId); const cashfreeOrderId = text(raw.cashfreeOrderId, 180); const paymentSessionId = text(raw.paymentSessionId, 5_000); const amount = money(raw.amount); const currency = text(raw.currency, 3); const status = text(raw.status, 30);
  if (!paymentOrderId || !checkoutId || !cashfreeOrderId || !paymentSessionId || amount === null || !currency || !status || !PAYMENT_STATUSES.has(status)) return null;
  return { paymentOrderId, checkoutId, cashfreeOrderId, paymentSessionId, amount, currency: currency.toUpperCase(), status: status as MobilePaymentSession['status'] };
}

export function parsePaymentVerification(value: unknown): MobilePaymentVerification | null {
  const raw = record(value); if (!raw) return null;
  const paymentOrderId = uuid(raw.paymentOrderId); const status = text(raw.status, 30);
  return paymentOrderId && status && PAYMENT_STATUSES.has(status) ? { paymentOrderId, status: status as MobilePaymentSession['status'] } : null;
}

export function validCheckoutInput(deliveryAddressId: string, note: string): boolean {
  return UUID.test(deliveryAddressId) && note.trim().length <= 500;
}
