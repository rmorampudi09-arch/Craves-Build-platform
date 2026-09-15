import type {CustomerKitchenMenuItemSummary} from './api/kitchenProfileApi';

export const ALL_KITCHEN_DISHES_CATEGORY = '__all__';

export function getCustomerKitchenDishCategories(
  items: readonly CustomerKitchenMenuItemSummary[],
): readonly string[] {
  const categories: string[] = [];

  items.forEach(item => {
    const category = item.category.trim();
    if (
      category &&
      !categories.some(
        existing => existing.toLocaleLowerCase() === category.toLocaleLowerCase(),
      )
    ) {
      categories.push(category);
    }
  });

  return categories;
}

export function filterCustomerKitchenDishes(
  items: readonly CustomerKitchenMenuItemSummary[],
  category: string,
): readonly CustomerKitchenMenuItemSummary[] {
  if (category === ALL_KITCHEN_DISHES_CATEGORY) {
    return items;
  }

  const normalizedCategory = category.trim().toLocaleLowerCase();
  return items.filter(
    item => item.category.trim().toLocaleLowerCase() === normalizedCategory,
  );
}

export function formatCustomerKitchenDishFoodType(
  foodType: CustomerKitchenMenuItemSummary['foodType'],
): string {
  if (foodType === 'NON_VEG') {
    return 'Non-veg';
  }
  if (foodType === 'EGG') {
    return 'Egg';
  }
  return 'Veg';
}

export function formatCustomerKitchenDishMetadata(
  item: CustomerKitchenMenuItemSummary,
): string {
  return [
    formatCustomerKitchenDishFoodType(item.foodType),
    item.preparationTimeMinutes ? `${item.preparationTimeMinutes} min` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' • ');
}
