import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {buildCartSnapshotRequest} from './cartApi';
import type {CartMoney, CartSnapshot} from '../domain/cartTypes';

export const CART_BILL_PREVIEW_AVAILABLE = true;

export interface CartBillPreview {
  deliveryAddressId: string;
  policyId: string;
  policyRevision: number;
  foodSubtotal: CartMoney;
  platformFee: CartMoney;
  deliveryFee: CartMoney;
  taxAmount: CartMoney;
  grandTotal: CartMoney;
  expiresAt: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function money(value: unknown, currency: string): CartMoney | null {
  return typeof value === 'string' && /^\d{1,12}\.\d{2}$/.test(value)
    ? {amount: value, currency}
    : null;
}

function paise(value: CartMoney): number {
  const [whole, fraction] = value.amount.split('.');
  return Number(whole) * 100 + Number(fraction);
}

export function parseCartBillPreview(
  value: unknown,
  snapshot: CartSnapshot,
  addressId: string,
  nowMs = Date.now(),
): CartBillPreview | null {
  const raw = record(value);
  const expected = record(raw?.expectedCart);
  if (!raw || !expected || expected.cartId !== snapshot.cartId || !Array.isArray(expected.items)
    || expected.items.length !== snapshot.lines.length || raw.deliveryAddressId !== addressId
    || raw.currency !== snapshot.currency || typeof raw.policyId !== 'string'
    || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(raw.policyId)
    || !Number.isSafeInteger(raw.policyRevision) || Number(raw.policyRevision) < 1
    || typeof raw.pricedAt !== 'string' || typeof raw.expiresAt !== 'string') return null;
  const pricedAt = Date.parse(raw.pricedAt);
  const expiresAt = Date.parse(raw.expiresAt);
  if (!Number.isFinite(pricedAt) || !Number.isFinite(expiresAt) || pricedAt > nowMs + 30_000
    || expiresAt <= nowMs || expiresAt <= pricedAt || expiresAt - pricedAt > 120_000) return null;
  const byId = new Map(snapshot.lines.map(line => [line.lineId, line]));
  const seen = new Set<string>();
  for (const valueOfLine of expected.items) {
    const item = record(valueOfLine);
    const line = typeof item?.id === 'string' ? byId.get(item.id) : null;
    if (!line || seen.has(line.lineId) || item?.quantity !== line.quantity
      || typeof item.updatedAt !== 'string' || item.updatedAt !== line.updatedAt) return null;
    seen.add(line.lineId);
  }
  const foodSubtotal = money(raw.foodSubtotal, snapshot.currency);
  const platformFee = money(raw.platformFee, snapshot.currency);
  const deliveryFee = money(raw.deliveryFee, snapshot.currency);
  const taxAmount = money(raw.taxAmount, snapshot.currency);
  const grandTotal = money(raw.grandTotal, snapshot.currency);
  if (!foodSubtotal || !platformFee || !deliveryFee || !taxAmount || !grandTotal
    || Number(foodSubtotal.amount) !== Number(snapshot.totals.foodSubtotal.amount)
    || paise(foodSubtotal) + paise(platformFee) + paise(deliveryFee) + paise(taxAmount) !== paise(grandTotal)) return null;
  return {deliveryAddressId: addressId, policyId: raw.policyId, policyRevision: Number(raw.policyRevision),
    foodSubtotal, platformFee, deliveryFee, taxAmount, grandTotal, expiresAt: raw.expiresAt};
}

export const cartBillPreviewApi = {
  async preview(snapshot: CartSnapshot, deliveryAddressId: string, signal?: AbortSignal): Promise<CartBillPreview> {
    const response = await httpClient.post<unknown>('/api/v1/cart/bill-preview', {
      deliveryAddressId, expectedCart: buildCartSnapshotRequest(snapshot),
    }, {signal});
    const result = parseCartBillPreview(response, snapshot, deliveryAddressId);
    if (!result) throw new AppApiError('BILL_PREVIEW_INVALID', 'Bill details could not be verified. Please retry.');
    return result;
  },
};
