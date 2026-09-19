import {
  buildCartSnapshotRequest,
  buildReorderCartRequest,
  buildSwitchKitchenRequest,
  parseCartSnapshot,
} from './api/cartApi';
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

const expectedCartJson = {
  cartId: '11111111-1111-4111-8111-111111111111',
  items: [{
    id: '22222222-2222-4222-8222-222222222222',
    quantity: 2,
    updatedAt: '2026-09-19T10:05:00Z',
  }],
};

describe('conditional cart JSON contract', () => {
  it('sends the exact clear-if-unchanged body expected by main', () => {
    expect(buildCartSnapshotRequest(snapshot)).toEqual(expectedCartJson);
  });

  it('sends the exact switch-kitchen body expected by main', () => {
    expect(
      buildSwitchKitchenRequest(
        snapshot,
        '55555555-5555-4555-8555-555555555555',
        3,
        '66666666-6666-4666-8666-666666666666',
      ),
    ).toEqual({
      expectedCart: expectedCartJson,
      menuItemId: '55555555-5555-4555-8555-555555555555',
      expectedKitchenId: '66666666-6666-4666-8666-666666666666',
      quantity: 3,
    });
  });

  it('sends the exact reorder-if-unchanged body expected by main', () => {
    expect(
      buildReorderCartRequest(
        snapshot,
        '66666666-6666-4666-8666-666666666666',
      ),
    ).toEqual({
      expectedCart: expectedCartJson,
      expectedKitchenId: '66666666-6666-4666-8666-666666666666',
    });
  });

  it('does not leak display, price, kitchen or menu metadata into compare-and-swap preconditions', () => {
    const serialized = JSON.stringify(buildCartSnapshotRequest(snapshot));
    expect(serialized).not.toContain('menuItemId');
    expect(serialized).not.toContain('kitchenId');
    expect(serialized).not.toContain('unitPrice');
    expect(serialized).not.toContain('itemName');
  });

  it('accepts the CartResponse JSON returned by the Order service', () => {
    expect(
      parseCartSnapshot({
        id: snapshot.cartId,
        customerIdentityId: '77777777-7777-4777-8777-777777777777',
        currency: 'INR',
        items: [{
          id: snapshot.lines[0].lineId,
          menuItemId: snapshot.lines[0].menuItemId,
          kitchenId: snapshot.lines[0].kitchenId,
          itemName: snapshot.lines[0].itemName,
          kitchenName: snapshot.lines[0].kitchenName,
          unitPrice: 100.0,
          currency: 'INR',
          quantity: 2,
          lineTotal: 200.0,
          createdAt: snapshot.lines[0].createdAt,
          updatedAt: snapshot.lines[0].updatedAt,
        }],
        totals: {foodSubtotal: 200.0, currency: 'INR'},
      }),
    ).toEqual({
      ...snapshot,
      lines: [{
        ...snapshot.lines[0],
        unitPrice: {amount: '100', currency: 'INR'},
        lineTotal: {amount: '200', currency: 'INR'},
        imageUrl: null,
        foodType: null,
        servesCount: null,
        spiceLevel: null,
      }],
      totals: {foodSubtotal: {amount: '200', currency: 'INR'}},
    });
  });

  it('rejects malformed response JSON instead of trusting TypeScript types', () => {
    expect(
      parseCartSnapshot({
        id: snapshot.cartId,
        customerIdentityId: '77777777-7777-4777-8777-777777777777',
        currency: 'INR',
        items: [{
          id: snapshot.lines[0].lineId,
          menuItemId: snapshot.lines[0].menuItemId,
          kitchenId: snapshot.lines[0].kitchenId,
          itemName: snapshot.lines[0].itemName,
          kitchenName: snapshot.lines[0].kitchenName,
          unitPrice: 100,
          currency: 'USD',
          quantity: 2,
          lineTotal: 200,
          createdAt: snapshot.lines[0].createdAt,
          updatedAt: snapshot.lines[0].updatedAt,
        }],
        totals: {foodSubtotal: 200, currency: 'INR'},
      }),
    ).toBeNull();
  });
});
