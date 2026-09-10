import {repeatOrderCandidateSchema} from '../api/repeatOrdersApi';

describe('Favorites P3 repeat-order contract', () => {
  const candidate = {
    orderId: '11111111-1111-4111-8111-111111111111',
    kitchenId: '22222222-2222-4222-8222-222222222222',
    kitchenName: 'Lakshmi Home Kitchen',
    lastOrderedAt: '2026-08-20T12:00:00Z',
    completedOrdersFromKitchen: 3,
    items: [
      {
        menuItemId: '33333333-3333-4333-8333-333333333333',
        itemName: 'Chicken Biryani',
        quantity: 1,
      },
    ],
    previousOrderTotal: '349.00',
    previousOrderCurrency: 'INR',
    orderLikeLastTimeAvailable: true,
    preferenceRecallSupported: false,
    rememberedPreferenceCount: 0,
    currentValidationNotice:
      'Current menu availability and price are checked before your cart changes.',
  } as const;

  it('accepts a truthful repeat-order candidate', () => {
    expect(repeatOrderCandidateSchema.parse(candidate)).toEqual(candidate);
  });

  it('rejects a candidate that pretends reorder is unavailable', () => {
    expect(
      repeatOrderCandidateSchema.safeParse({
        ...candidate,
        orderLikeLastTimeAvailable: false,
      }).success,
    ).toBe(false);
  });

  it('rejects malformed current-truth guidance', () => {
    expect(
      repeatOrderCandidateSchema.safeParse({
        ...candidate,
        currentValidationNotice: '',
      }).success,
    ).toBe(false);
  });
});
