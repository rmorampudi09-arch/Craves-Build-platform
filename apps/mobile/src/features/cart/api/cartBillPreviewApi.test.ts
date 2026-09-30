import {buildCartSnapshotRequest} from './cartApi';
import {cartBillPreviewApi, parseCartBillPreview} from './cartBillPreviewApi';
import {cartBillPreviewInputKey} from '../query/useCartBillPreview';
import {httpClient} from '../../../core/http/httpClient';
import type {CartSnapshot} from '../domain/cartTypes';

jest.mock('../../../core/http/httpClient', () => ({httpClient: {post: jest.fn()}}));
const addressId = '55555555-5555-4555-8555-555555555555';
const now = Date.parse('2026-09-30T00:00:00Z');
const snapshot: CartSnapshot = {
  cartId: '11111111-1111-4111-8111-111111111111', currency: 'INR',
  lines: [{lineId: '22222222-2222-4222-8222-222222222222',
    menuItemId: '33333333-3333-4333-8333-333333333333', kitchenId: '44444444-4444-4444-8444-444444444444',
    itemName: 'Biryani', kitchenName: 'Kitchen', unitPrice: {amount: '125.50', currency: 'INR'}, quantity: 2,
    lineTotal: {amount: '251.00', currency: 'INR'}, createdAt: '2026-09-29T00:00:00Z', updatedAt: '2026-09-29T00:01:00Z'}],
  totals: {foodSubtotal: {amount: '251.00', currency: 'INR'}},
};
function response() {
  return {expectedCart: buildCartSnapshotRequest(snapshot), deliveryAddressId: addressId,
    policyId: '20000000-0000-0000-0000-000000000001', policyRevision: 2, currency: 'INR',
    foodSubtotal: '251.00', platformFee: '5.00', deliveryFee: '30.00', taxAmount: '18.85', grandTotal: '304.85',
    pricedAt: new Date(now).toISOString(), expiresAt: new Date(now + 120_000).toISOString()};
}

describe('read-only cart bill preview', () => {
  it('accepts all server fee amounts, including the seeded policy identifier', () => {
    expect(parseCartBillPreview(response(), snapshot, addressId, now)?.grandTotal.amount).toBe('304.85');
  });
  it.each(['platformFee', 'deliveryFee', 'taxAmount', 'grandTotal'] as const)('rejects a missing %s rather than inventing it', field => {
    expect(parseCartBillPreview({...response(), [field]: undefined}, snapshot, addressId, now)).toBeNull();
  });
  it('rejects changed cart quantities, timestamps, addresses and duplicate items', () => {
    const value = response();
    expect(parseCartBillPreview(value, {...snapshot, lines: [{...snapshot.lines[0], quantity: 3}]}, addressId, now)).toBeNull();
    expect(parseCartBillPreview(value, {...snapshot, lines: [{...snapshot.lines[0], updatedAt: '2026-09-29T00:02:00Z'}]}, addressId, now)).toBeNull();
    expect(parseCartBillPreview(value, snapshot, 'another-address', now)).toBeNull();
    expect(parseCartBillPreview({...value, expectedCart: {...value.expectedCart, items: [...value.expectedCart.items, ...value.expectedCart.items]}}, snapshot, addressId, now)).toBeNull();
  });
  it('rejects expired quotes and totals that do not reconcile to exact paise', () => {
    expect(parseCartBillPreview(response(), snapshot, addressId, now + 120_000)).toBeNull();
    expect(parseCartBillPreview({...response(), grandTotal: '304.86'}, snapshot, addressId, now)).toBeNull();
    expect(parseCartBillPreview({...response(), foodSubtotal: '250.00', grandTotal: '303.85'}, snapshot, addressId, now)).toBeNull();
  });
  it('accepts zero policy fees and taxes', () => {
    expect(parseCartBillPreview({...response(), platformFee: '0.00', deliveryFee: '0.00', taxAmount: '0.00', grandTotal: '251.00'}, snapshot, addressId, now)?.platformFee.amount).toBe('0.00');
  });
  it('keys the preview by the selected address and every cart price/quantity input', () => {
    const key = cartBillPreviewInputKey(snapshot, addressId);
    expect(cartBillPreviewInputKey(snapshot, 'another-address')).not.toBe(key);
    expect(cartBillPreviewInputKey({...snapshot, lines: [{...snapshot.lines[0], quantity: 3}]}, addressId)).not.toBe(key);
    expect(cartBillPreviewInputKey({...snapshot, lines: [{...snapshot.lines[0], unitPrice: {amount: '126.00', currency: 'INR'}}]}, addressId)).not.toBe(key);
  });
  it('sends only identifiers, quantities and timestamps, never client prices or payment creation', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    jest.mocked(httpClient.post).mockResolvedValue(response());
    await cartBillPreviewApi.preview(snapshot, addressId);
    expect(httpClient.post).toHaveBeenCalledWith('/api/v1/cart/bill-preview', {
      deliveryAddressId: addressId, expectedCart: buildCartSnapshotRequest(snapshot),
    }, {signal: undefined});
    jest.restoreAllMocks();
  });
});
