import {CUSTOMER_DISH_DETAIL_CONTRACT_GAPS} from './api/dishDetailApi';
import {
  formatCustomerDishIngredientsBlockerMessage,
  getCustomerDishIngredientsCapabilityState,
} from './dishIngredientsCapability';

describe('dishIngredientsCapability', () => {
  it('fails closed when authoritative ingredient or allergen capabilities are missing', () => {
    const state = getCustomerDishIngredientsCapabilityState(
      CUSTOMER_DISH_DETAIL_CONTRACT_GAPS,
    );

    expect(state.available).toBe(false);
    expect(state.blockers.map(blocker => blocker.capability)).toEqual([
      'INGREDIENTS',
      'ALLERGENS',
    ]);
    expect(formatCustomerDishIngredientsBlockerMessage(state)).toContain(
      'does not expose ingredients',
    );
    expect(formatCustomerDishIngredientsBlockerMessage(state)).toContain(
      'does not expose allergen metadata',
    );
  });

  it('ignores unrelated dish-detail gaps when the required capabilities are present', () => {
    const state = getCustomerDishIngredientsCapabilityState([
      {capability: 'REVIEWS', reason: 'reviews missing'},
      {capability: 'FAVORITES', reason: 'favorites missing'},
    ]);

    expect(state).toEqual({available: true, blockers: []});
  });
});