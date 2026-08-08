import type {NearbyDish, NearbyDishPage} from './api/homeFeedApi';

export function flattenNearbyDishPages(
  pages: readonly NearbyDishPage[] | undefined,
): NearbyDish[] {
  if (!pages?.length) {
    return [];
  }

  const seen = new Set<string>();
  const dishes: NearbyDish[] = [];
  for (const page of pages) {
    for (const dish of page.menuItems) {
      if (!seen.has(dish.id)) {
        seen.add(dish.id);
        dishes.push(dish);
      }
    }
  }
  return dishes;
}

export function getHomeCategories(dishes: readonly NearbyDish[]): string[] {
  const categories = new Set<string>();
  dishes.forEach(dish => {
    const category = dish.category.trim();
    if (category) {
      categories.add(category);
    }
  });
  return Array.from(categories).sort((left, right) => left.localeCompare(right));
}

export function filterHomeDishes(
  dishes: readonly NearbyDish[],
  searchQuery: string,
  selectedCategory: string | null,
): NearbyDish[] {
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  return dishes.filter(dish => {
    if (selectedCategory && dish.category !== selectedCategory) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    const searchable = [
      dish.itemName,
      dish.description ?? '',
      dish.category,
      dish.kitchenDisplayName ?? dish.kitchenName,
    ]
      .join(' ')
      .toLocaleLowerCase();
    return searchable.includes(normalizedSearch);
  });
}

export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.max(0, Math.round(distanceMeters))} m away`;
  }
  const kilometers = distanceMeters / 1000;
  const rounded = kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers).toString();
  return `${rounded} km away`;
}

export function formatDishPrice(price: number, currency: string): string {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (normalizedCurrency === 'INR') {
    return `₹${price.toFixed(price % 1 === 0 ? 0 : 2)}`;
  }
  return `${normalizedCurrency} ${price.toFixed(2)}`;
}
