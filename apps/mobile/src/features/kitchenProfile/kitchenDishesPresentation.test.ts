import type {CustomerKitchenMenuItemSummary} from './api/kitchenProfileApi';
import {
  ALL_KITCHEN_DISHES_CATEGORY,
  filterCustomerKitchenDishes,
  formatCustomerKitchenDishMetadata,
  getCustomerKitchenDishCategories,
} from './kitchenDishesPresentation';

function menuItem(
  id: string,
  category: string,
  foodType: CustomerKitchenMenuItemSummary['foodType'] = 'VEG',
  preparationTimeMinutes: number | null = 20,
): CustomerKitchenMenuItemSummary {
  return {
    id,
    itemName: `Dish ${id}`,
    description: null,
    category,
    foodType,
    price: {amount: 150, currency: 'INR'},
    servesCount: 1,
    preparationTimeMinutes,
    spiceLevel: null,
    images: [],
  };
}

describe('kitchenDishesPresentation', () => {
  it('keeps first-seen backend category order and removes case-only duplicates', () => {
    const items = [
      menuItem('1', 'Breakfast'),
      menuItem('2', 'Mains'),
      menuItem('3', 'breakfast'),
      menuItem('4', 'Dessert'),
    ];

    expect(getCustomerKitchenDishCategories(items)).toEqual([
      'Breakfast',
      'Mains',
      'Dessert',
    ]);
  });

  it('filters without reordering the current public menu response', () => {
    const items = [
      menuItem('1', 'Mains'),
      menuItem('2', 'Dessert'),
      menuItem('3', 'mains'),
    ];

    expect(filterCustomerKitchenDishes(items, 'MAINS').map(item => item.id)).toEqual([
      '1',
      '3',
    ]);
    expect(filterCustomerKitchenDishes(items, ALL_KITCHEN_DISHES_CATEGORY)).toBe(
      items,
    );
  });

  it('formats only supported food type and preparation-time metadata', () => {
    expect(formatCustomerKitchenDishMetadata(menuItem('1', 'Mains'))).toBe(
      'Veg • 20 min',
    );
    expect(
      formatCustomerKitchenDishMetadata(menuItem('2', 'Mains', 'NON_VEG', null)),
    ).toBe('Non-veg');
  });
});
