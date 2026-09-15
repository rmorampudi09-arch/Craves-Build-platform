import {
  CUSTOMER_DISH_DETAIL_CONTRACT_GAPS,
  type CustomerDishDetail,
} from './api/dishDetailApi';
import {
  evaluateDishCartRevalidation,
  formatDishDetailPrice,
} from './dishDetailPurchase';

function dish(overrides: Partial<CustomerDishDetail> = {}): CustomerDishDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kitchen: {
      id: '22222222-2222-4222-8222-222222222222',
      kitchenName: 'Test Kitchen',
      displayName: null,
      description: null,
      areaName: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
    },
    itemName: 'Paneer Bowl',
    description: 'Freshly prepared paneer bowl.',
    category: 'Bowls',
    cuisine: null,
    foodType: 'VEG',
    price: {amount: 220, currency: 'INR'},
    servesCount: 1,
    preparationTimeMinutes: 25,
    spiceLevel: 'MEDIUM',
    unitPackageWeightGrams: 450,
    thermoboxRequired: false,
    availability: {available: true, status: 'ACTIVE'},
    images: [],
    ingredients: null,
    allergens: null,
    reviewSummary: {aggregateRating: null, reviewCount: null},
    favoriteState: null,
    contractGaps: CUSTOMER_DISH_DETAIL_CONTRACT_GAPS,
    ...overrides,
  };
}

describe('dishDetailPurchase', () => {
  it('formats INR and other currencies consistently', () => {
    expect(formatDishDetailPrice(220, 'INR')).toBe('₹220');
    expect(formatDishDetailPrice(12.5, 'USD')).toBe('USD 12.50');
  });

  it('allows a mutation after an unchanged authoritative refresh', () => {
    const current = dish();
    expect(evaluateDishCartRevalidation(current, dish())).toEqual({status: 'READY'});
  });

  it('requires customer confirmation when the price changed', () => {
    const result = evaluateDishCartRevalidation(
      dish(),
      dish({price: {amount: 240, currency: 'INR'}}),
    );

    expect(result.status).toBe('PRICE_CHANGED');
    if (result.status === 'PRICE_CHANGED') {
      expect(result.message).toContain('₹240');
    }
  });

  it('blocks a mismatched dish or kitchen identity', () => {
    const result = evaluateDishCartRevalidation(
      dish(),
      dish({
        kitchen: {
          ...dish().kitchen,
          id: '33333333-3333-4333-8333-333333333333',
        },
      }),
    );

    expect(result.status).toBe('BLOCKED');
  });
});
