import type {CustomerKitchenMenuItemSummary} from './api/kitchenProfileApi';
import {
  formatCustomerKitchenJoinedLabel,
  formatCustomerKitchenLocation,
  getCustomerKitchenInitials,
  getCustomerKitchenMenuImage,
  getCustomerKitchenMenuPreview,
} from './kitchenProfilePresentation';

function menuItem(
  id: string,
  itemName: string,
  category: string,
): CustomerKitchenMenuItemSummary {
  return {
    id,
    itemName,
    description: null,
    category,
    foodType: 'VEG',
    price: {amount: 120, currency: 'INR'},
    servesCount: 1,
    preparationTimeMinutes: 20,
    spiceLevel: 'MILD',
    images: [],
  };
}

describe('kitchenProfilePresentation', () => {
  it('builds compact kitchen initials from the public display identity', () => {
    expect(
      getCustomerKitchenInitials({
        kitchenName: 'Spice Route Kitchen',
        displayName: 'Maya Home Foods',
      }),
    ).toBe('MF');
    expect(
      getCustomerKitchenInitials({kitchenName: 'Craves', displayName: null}),
    ).toBe('CR');
  });

  it('formats only available public location and tenure facts', () => {
    expect(
      formatCustomerKitchenLocation({
        areaName: 'Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
      }),
    ).toBe('Indiranagar, Bengaluru, Karnataka');
    expect(
      formatCustomerKitchenLocation({areaName: null, city: null, state: null}),
    ).toBeNull();
    expect(formatCustomerKitchenJoinedLabel('2024-03-10T12:00:00Z')).toBe(
      'On Craves since 2024',
    );
    expect(formatCustomerKitchenJoinedLabel('not-a-date')).toBeNull();
  });

  it('preserves authoritative menu order instead of inventing a top-dish ranking', () => {
    const items = [
      menuItem('1', 'Zucchini Curry', 'Mains'),
      menuItem('2', 'Apple Halwa', 'Dessert'),
      menuItem('3', 'Bread Pakora', 'Snacks'),
    ];
    expect(getCustomerKitchenMenuPreview(items, 2).map(item => item.id)).toEqual([
      '1',
      '2',
    ]);
  });

  it('prefers a primary menu image without changing the upstream image collection', () => {
    const item = menuItem('1', 'Dal', 'Mains');
    const withImages: CustomerKitchenMenuItemSummary = {
      ...item,
      images: [
        {id: 'a', url: 'https://example.com/a.jpg', primary: false, sortOrder: 1},
        {id: 'b', url: 'https://example.com/b.jpg', primary: true, sortOrder: 2},
      ],
    };
    expect(getCustomerKitchenMenuImage(withImages)?.id).toBe('b');
  });
});
