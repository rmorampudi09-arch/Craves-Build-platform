import type {RepeatOrderCandidate} from '../api/repeatOrdersApi';
import type {PublicResolvedMenuItem} from '../../catalog/api/publicMenuBatchApi';
import {resolveRepeatOrderCatalogStatus} from './useRepeatOrderCatalogPrecheck';

const candidate: RepeatOrderCandidate = {
  orderId: '11111111-1111-4111-8111-111111111111',
  kitchenId: '22222222-2222-4222-8222-222222222222',
  kitchenName: 'Home Kitchen',
  lastOrderedAt: '2026-09-10T12:00:00Z',
  completedOrdersFromKitchen: 3,
  items: [
    {
      menuItemId: '33333333-3333-4333-8333-333333333333',
      itemName: 'Meal',
      quantity: 1,
    },
  ],
  previousOrderTotal: '199',
  previousOrderCurrency: 'INR',
  orderLikeLastTimeAvailable: true,
  preferenceRecallSupported: false,
  rememberedPreferenceCount: 0,
  currentValidationNotice: 'Current prices and availability are checked again.',
};

function resolved(
  overrides: Partial<PublicResolvedMenuItem> = {},
): PublicResolvedMenuItem {
  return {
    id: candidate.items[0].menuItemId,
    kitchenId: candidate.kitchenId,
    itemName: 'Meal',
    price: 219,
    currency: 'INR',
    unitPackageWeightGrams: 450,
    thermoboxRequired: false,
    ...overrides,
  };
}

describe('repeat order Catalog precheck', () => {
  it('marks the basket currently available only when every item resolves to the same kitchen', () => {
    expect(
      resolveRepeatOrderCatalogStatus(
        candidate,
        new Map([[candidate.items[0].menuItemId, resolved()]]),
      ),
    ).toBe('CURRENTLY_AVAILABLE');
  });

  it('requires review when an old item is omitted as unavailable', () => {
    expect(resolveRepeatOrderCatalogStatus(candidate, new Map())).toBe(
      'REVIEW_REQUIRED',
    );
  });

  it('requires review rather than silently accepting a kitchen mismatch', () => {
    expect(
      resolveRepeatOrderCatalogStatus(
        candidate,
        new Map([
          [
            candidate.items[0].menuItemId,
            resolved({
              kitchenId: '44444444-4444-4444-8444-444444444444',
            }),
          ],
        ]),
      ),
    ).toBe('REVIEW_REQUIRED');
  });
});
