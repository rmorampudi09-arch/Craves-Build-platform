import type {RepeatOrderCandidate} from '../api/repeatOrdersApi';
import {rankRepeatOrderCandidates, repeatOrderBasketSummary} from './repeatOrderPresentation';

const id = (value: number) => `00000000-0000-0000-0000-${value.toString().padStart(12, '0')}`;

function candidate(order: number, kitchen: number, count: number, time: string): RepeatOrderCandidate {
  return {
    orderId: id(order),
    kitchenId: id(kitchen),
    kitchenName: `Kitchen ${kitchen}`,
    lastOrderedAt: time,
    completedOrdersFromKitchen: count,
    items: [{menuItemId: id(order + 100), itemName: 'Dal', quantity: 1}],
    previousOrderTotal: '250.00',
    previousOrderCurrency: 'INR',
    orderLikeLastTimeAvailable: true,
    preferenceRecallSupported: false,
    rememberedPreferenceCount: 0,
    currentValidationNotice: 'Current truth is revalidated.',
  };
}

describe('repeatOrderPresentation', () => {
  it('puts a favorite kitchen cooking now ahead of a more frequent generic kitchen', () => {
    const favorite = candidate(1, 10, 2, '2026-08-20T10:00:00Z');
    const frequent = candidate(2, 20, 10, '2026-08-21T10:00:00Z');
    const ranked = rankRepeatOrderCandidates([frequent, favorite], {
      favoriteKitchenIds: new Set([favorite.kitchenId]),
      homeFeed: [{
        requestedType: 'KITCHEN',
        requestedId: favorite.kitchenId,
        exists: true,
        kitchenId: favorite.kitchenId,
        chefIdentityId: id(30),
        kitchenName: 'Favorite',
        displayName: 'Favorite',
        kitchenStatus: 'ACTIVE',
        areaName: null,
        city: null,
        state: null,
        activeAvailableDishCount: 1,
        menuPreview: [],
        timezoneId: 'Asia/Kolkata',
        scheduleConfigured: true,
        acceptingOrders: true,
        paused: false,
        cookingState: 'COOKING_NOW',
        nextAvailabilityAt: null,
        evaluatedAt: '2026-08-21T10:00:00Z',
      }],
    });
    expect(ranked.map(item => item.orderId)).toEqual([favorite.orderId, frequent.orderId]);
  });

  it('uses transparent frequency and recency when relationship rank is equal', () => {
    const olderFrequent = candidate(1, 10, 4, '2026-08-19T10:00:00Z');
    const recentRare = candidate(2, 20, 2, '2026-08-21T10:00:00Z');
    const ranked = rankRepeatOrderCandidates([recentRare, olderFrequent], {
      favoriteKitchenIds: new Set(),
      homeFeed: [],
    });
    expect(ranked[0].orderId).toBe(olderFrequent.orderId);
  });

  it('summarizes the previous basket without implying current availability', () => {
    const value = candidate(1, 10, 1, '2026-08-21T10:00:00Z');
    value.items.push(
      {menuItemId: id(102), itemName: 'Rice', quantity: 2},
      {menuItemId: id(103), itemName: 'Curd', quantity: 1},
    );
    expect(repeatOrderBasketSummary(value)).toBe('Dal, 2× Rice +1 more');
  });
});
