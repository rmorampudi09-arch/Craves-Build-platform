import type {FavoriteHomeCard} from '../api/favoriteHomeFeedApi';
import {favoriteHomeStateCopy, isCookingToday} from './favoriteHomePresentation';

function card(state: FavoriteHomeCard['cookingState']): FavoriteHomeCard {
  return {
    requestedType: 'KITCHEN',
    requestedId: '00000000-0000-0000-0000-000000000001',
    exists: true,
    kitchenId: '00000000-0000-0000-0000-000000000001',
    chefIdentityId: '00000000-0000-0000-0000-000000000002',
    kitchenName: 'Home Kitchen',
    displayName: 'Home Kitchen',
    kitchenStatus: 'ACTIVE',
    areaName: 'Madhapur',
    city: 'Hyderabad',
    state: 'Telangana',
    activeAvailableDishCount: 2,
    menuPreview: [],
    timezoneId: 'Asia/Kolkata',
    scheduleConfigured: true,
    acceptingOrders: true,
    paused: false,
    cookingState: state,
    nextAvailabilityAt: null,
    evaluatedAt: '2026-08-21T00:00:00Z',
  };
}

describe('favoriteHomePresentation', () => {
  it('only classifies authoritative now/later states as cooking today', () => {
    expect(isCookingToday(card('COOKING_NOW'))).toBe(true);
    expect(isCookingToday(card('COOKING_LATER_TODAY'))).toBe(true);
    expect(isCookingToday(card('NOT_TODAY'))).toBe(false);
  });

  it('does not invent a reopening time when not accepting orders', () => {
    expect(favoriteHomeStateCopy(card('NOT_ACCEPTING'))).toMatchObject({
      title: 'Not taking orders',
      detail: 'We will not guess when ordering resumes',
    });
  });
});
