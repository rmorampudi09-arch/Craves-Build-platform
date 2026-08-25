const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PersonalisedRecommendation = {
  menuItemId: string;
  kitchenId: string;
  kitchenName: string;
  kitchenDisplayName: string | null;
  areaName: string | null;
  city: string | null;
  itemName: string;
  description: string | null;
  category: string;
  foodType: string;
  price: number;
  currency: string;
  preparationTimeMinutes: number | null;
  primaryImageUrl: string | null;
  reasonCode: "SAVED_BY_YOU";
};

export function parsePersonalisedRecommendations(value: unknown): PersonalisedRecommendation[] | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.items) || raw.items.length > 20) return null;
  const items: PersonalisedRecommendation[] = [];
  for (const value of raw.items) {
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    if (
      typeof item.menuItemId !== "string" || !UUID.test(item.menuItemId) ||
      typeof item.kitchenId !== "string" || !UUID.test(item.kitchenId) ||
      typeof item.kitchenName !== "string" ||
      (item.kitchenDisplayName !== null && typeof item.kitchenDisplayName !== "string") ||
      (item.areaName !== null && typeof item.areaName !== "string") ||
      (item.city !== null && typeof item.city !== "string") ||
      typeof item.itemName !== "string" ||
      (item.description !== null && typeof item.description !== "string") ||
      typeof item.category !== "string" || typeof item.foodType !== "string" ||
      typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0 ||
      typeof item.currency !== "string" || item.currency.length !== 3 ||
      (item.preparationTimeMinutes !== null && (typeof item.preparationTimeMinutes !== "number" || !Number.isInteger(item.preparationTimeMinutes) || item.preparationTimeMinutes < 0)) ||
      (item.primaryImageUrl !== null && typeof item.primaryImageUrl !== "string") ||
      item.reasonCode !== "SAVED_BY_YOU"
    ) return null;
    items.push(item as PersonalisedRecommendation);
  }
  return items;
}
