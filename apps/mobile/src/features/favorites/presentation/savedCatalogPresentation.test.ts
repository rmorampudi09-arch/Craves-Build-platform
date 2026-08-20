import type {SavedCatalogItem} from '../api/savedCatalogApi';
import {
  availabilityCopyForState,
  canOpenSavedDish,
  savedDishDisplayName,
} from './savedCatalogPresentation';

function item(overrides: Partial<SavedCatalogItem> = {}): SavedCatalogItem {
  return {
    menuItemId: '00000000-0000-4000-8000-000000000001',
    found: true,
    availabilityState: 'AVAILABLE_NOW',
    evaluatedAt: '2026-08-21T00:00:00Z',
    itemName: 'Home meal',
    description: null,
    category: 'HOME_STYLE',
    foodType: 'VEG',
    price: 120,
    currency: 'INR',
    itemStatus: 'ACTIVE',
    itemAvailable: true,
    kitchenId: '10000000-0000-4000-8000-000000000001',
    kitchenName: 'Home Kitchen',
    kitchenDisplayName: 'Home Kitchen',
    kitchenStatus: 'ACTIVE',
    areaName: 'Hyderabad',
    city: 'Hyderabad',
    state: 'Telangana',
    primaryImageUrl: null,
    timezoneId: 'Asia/Kolkata',
    scheduleConfigured: true,
    acceptingOrders: true,
    paused: false,
    availableNow: true,
    nextAvailabilityAt: null,
    ...overrides,
  };
}

describe('savedCatalogPresentation', () => {
  it('uses the Craves signature Cooking Today message only for proven schedule states', () => {
    expect(availabilityCopyForState('AVAILABLE_NOW', null).title).toBe(
      'Cooking now',
    );
    expect(
      availabilityCopyForState(
        'COOKING_LATER_TODAY',
        '2026-08-21T10:30:00Z',
      ).title,
    ).toBe('Cooking later today');
  });

  it('never invents a sold-out reason from a generic item availability flag', () => {
    const copy = availabilityCopyForState('ITEM_UNAVAILABLE', null);

    expect(copy.title.toLowerCase()).not.toContain('sold out');
    expect(copy.detail?.toLowerCase()).toContain('does not say why');
  });

  it('keeps missing and retired items visible but non-navigable', () => {
    expect(
      canOpenSavedDish(
        item({found: false, availabilityState: 'MISSING', itemStatus: null}),
      ),
    ).toBe(false);
    expect(
      canOpenSavedDish(item({availabilityState: 'RETIRED', itemStatus: 'RETIRED'})),
    ).toBe(false);
  });

  it('provides a graceful display name for a missing catalog tombstone', () => {
    expect(savedDishDisplayName(item({found: false, itemName: null}))).toBe(
      'Saved dish',
    );
  });
});
