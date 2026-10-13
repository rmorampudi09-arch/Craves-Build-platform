import type {CustomerKitchenMenuItemSummary} from './api/kitchenProfileApi';
import {
  formatCustomerKitchenJoinedLabel,
  formatCustomerKitchenLocation,
  formatCustomerKitchenPrepRange,
  getActiveMenuSectionIndex,
  getCustomerKitchenFoodMixLabel,
  getCustomerKitchenInitials,
  getCustomerKitchenMenuImage,
  groupCustomerKitchenMenu,
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

  it('groups by first-seen category without reordering dishes or splitting case variants', () => {
    const items = [
      menuItem('1', 'Zucchini Curry', 'Mains'),
      menuItem('2', 'Apple Halwa', 'Dessert'),
      menuItem('3', 'Bread Pakora', ' mains '),
      menuItem('4', 'Mystery', '  '),
    ];
    expect(
      groupCustomerKitchenMenu(items).map(section => [
        section.category,
        section.items.map(item => item.id),
      ]),
    ).toEqual([
      ['Mains', ['1', '3']],
      ['Dessert', ['2']],
      ['Other', ['4']],
    ]);
  });

  it('labels the food mix from the menu only', () => {
    const veg = menuItem('1', 'Dal', 'Mains');
    const nonVeg = {...menuItem('2', 'Chicken', 'Mains'), foodType: 'NON_VEG' as const};
    const egg = {...menuItem('3', 'Omelette', 'Mains'), foodType: 'EGG' as const};
    expect(getCustomerKitchenFoodMixLabel([veg, nonVeg])).toBe('Veg & non-veg');
    expect(getCustomerKitchenFoodMixLabel([veg, egg])).toBe('Veg & non-veg');
    expect(getCustomerKitchenFoodMixLabel([veg])).toBe('Pure veg');
    expect(getCustomerKitchenFoodMixLabel([nonVeg, egg])).toBe('Non-veg');
    expect(getCustomerKitchenFoodMixLabel([egg])).toBe('Egg');
    expect(getCustomerKitchenFoodMixLabel([])).toBeNull();
  });

  it('formats the preparation-time range and ignores missing times', () => {
    const at = (minutes: number | null) => ({
      ...menuItem('1', 'Dish', 'Mains'),
      preparationTimeMinutes: minutes,
    });
    expect(formatCustomerKitchenPrepRange([at(30), at(15), at(null)])).toBe('15–30 min');
    expect(formatCustomerKitchenPrepRange([at(20), at(20)])).toBe('20 min');
    expect(formatCustomerKitchenPrepRange([at(null), at(0)])).toBeNull();
  });

  it('picks the last section whose top has scrolled past the tabs', () => {
    const tops = [0, 400, 900];
    expect(getActiveMenuSectionIndex(tops, -50)).toBe(0);
    expect(getActiveMenuSectionIndex(tops, 399)).toBe(0);
    expect(getActiveMenuSectionIndex(tops, 400)).toBe(1);
    expect(getActiveMenuSectionIndex(tops, 5000)).toBe(2);
    expect(getActiveMenuSectionIndex([0, Infinity], 5000)).toBe(0);
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
