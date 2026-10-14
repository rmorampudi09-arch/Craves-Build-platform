import type {FavoriteHomeCard} from '../api/favoriteHomeFeedApi';
import {favoriteHomeStateCopy, isCookingToday, mergeSavedHomes} from './favoriteHomePresentation';

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

  it('merges saved kitchens and saved home chefs into one row per home', () => {
    const kitchen = {...card('NOT_TODAY'), requestedId: 'k1', kitchenId: 'k1', chefIdentityId: 'c1'};
    const sameChef = {...card('NOT_TODAY'), requestedType: 'CHEF' as const, requestedId: 'c1', kitchenId: 'k1', chefIdentityId: 'c1'};
    const otherChef = {...card('COOKING_NOW'), requestedType: 'CHEF' as const, requestedId: 'c2', kitchenId: 'k2', chefIdentityId: 'c2'};

    const merged = mergeSavedHomes([kitchen], [sameChef, otherChef]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({kitchenId: null, chefIdentityId: 'c2'});
    expect(merged[1]).toMatchObject({card: kitchen, kitchenId: 'k1', chefIdentityId: 'c1'});
  });

  it('does not invent a reopening time when not accepting orders', () => {
    expect(favoriteHomeStateCopy(card('NOT_ACCEPTING'))).toMatchObject({
      title: 'Not taking orders',
      detail: 'We will not guess when ordering resumes',
    });
  });
});
