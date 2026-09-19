import {buildCartSnapshotRequest} from './api/cartApi';
import type {CartSnapshot} from './domain/cartTypes';

const snapshot: CartSnapshot = {
  cartId: '11111111-1111-4111-8111-111111111111',
  currency: 'INR',
  lines: [{
    lineId: '22222222-2222-4222-8222-222222222222',
    menuItemId: '33333333-3333-4333-8333-333333333333',
    kitchenId: '44444444-4444-4444-8444-444444444444',
    itemName: 'Meal',
    kitchenName: 'Home Kitchen',
    unitPrice: {amount: '100.00', currency: 'INR'},
    quantity: 2,
    lineTotal: {amount: '200.00', currency: 'INR'},
    imageUrl: null,
    foodType: null,
    servesCount: null,
    spiceLevel: null,
    createdAt: '2026-09-19T10:00:00Z',
    updatedAt: '2026-09-19T10:05:00Z',
  }],
  totals: {foodSubtotal: {amount: '200.00', currency: 'INR'}},
};

describe('conditional cart request contract', () => {
  it('sends only the server compare-and-swap fields', () => {
    expect(buildCartSnapshotRequest(snapshot)).toEqual({
      cartId: '11111111-1111-4111-8111-111111111111',
      items: [{
        id: '22222222-2222-4222-8222-222222222222',
        quantity: 2,
        updatedAt: '2026-09-19T10:05:00Z',
      }],
    });
  });

  it('does not leak display, price, kitchen or menu metadata into write preconditions', () => {
    const serialized = JSON.stringify(buildCartSnapshotRequest(snapshot));
    expect(serialized).not.toContain('menuItemId');
    expect(serialized).not.toContain('kitchenId');
    expect(serialized).not.toContain('unitPrice');
    expect(serialized).not.toContain('itemName');
  });
});
