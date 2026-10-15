/** A nearby dish as kitchen cards read it (the shape dish discovery already loads). */
export type KitchenCardDish = { kitchenId?: string; img: string; price: number; currency?: string; prepMinutes?: number };
export type KitchenDishSummary = { imageUrls: string[]; preparationTimeLabel: string | null; startingPriceLabel: string };

export function formatDishPrice(price: number, currency = "INR"): string {
  const code = currency.trim().toUpperCase();
  return code === "INR" ? `₹${price.toFixed(price % 1 === 0 ? 0 : 2)}` : `${code} ${price.toFixed(2)}`;
}

/** "25 min" or "20–45 min" across the dishes' cooking times; null when none gave one. Not a delivery estimate. */
export function formatPreparationTime(dishes: readonly Pick<KitchenCardDish, "prepMinutes">[]): string | null {
  const minutes = dishes.map((dish) => dish.prepMinutes).filter((value): value is number => typeof value === "number" && value > 0);
  if (!minutes.length) return null;
  const low = Math.min(...minutes);
  const high = Math.max(...minutes);
  return low === high ? `${low} min` : `${low}–${high} min`;
}

/** Photos, prep time and cheapest price per kitchen, derived from the dishes already loaded (the app does the same). */
export function summarizeKitchenDishes(dishes: readonly KitchenCardDish[]): Map<string, KitchenDishSummary> {
  const byKitchen = new Map<string, KitchenCardDish[]>();
  for (const dish of dishes) if (dish.kitchenId) byKitchen.set(dish.kitchenId, [...(byKitchen.get(dish.kitchenId) ?? []), dish]);
  const summaries = new Map<string, KitchenDishSummary>();
  byKitchen.forEach((kitchenDishes, kitchenId) => {
    const cheapest = kitchenDishes.reduce((low, dish) => (dish.price < low.price ? dish : low));
    summaries.set(kitchenId, {
      // Placeholder artwork is a site path, never https, so only real dish photos remain.
      imageUrls: [...new Set(kitchenDishes.map((dish) => dish.img).filter((url) => url.startsWith("https://")))],
      preparationTimeLabel: formatPreparationTime(kitchenDishes),
      startingPriceLabel: formatDishPrice(cheapest.price, cheapest.currency),
    });
  });
  return summaries;
}
