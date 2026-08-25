const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdvancedSearchItem = {
  id: string;
  kitchenId: string;
  kitchenName: string;
  kitchenDisplayName: string | null;
  areaName: string | null;
  city: string;
  distanceMeters: number;
  itemName: string;
  description: string | null;
  category: string;
  foodType: "VEG" | "NON_VEG";
  price: number;
  currency: string;
  preparationTimeMinutes: number | null;
  primaryImageUrl: string | null;
};

export type AdvancedSearchResponse = {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  items: AdvancedSearchItem[];
};

export function parseAdvancedSearchResponse(value: unknown): AdvancedSearchResponse | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (![raw.page, raw.size, raw.totalElements, raw.totalPages].every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0)) return null;
  if (typeof raw.hasNext !== "boolean" || !Array.isArray(raw.items) || raw.items.length > 100) return null;

  const items: AdvancedSearchItem[] = [];
  for (const value of raw.items) {
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    if (
      typeof item.id !== "string" || !UUID.test(item.id) ||
      typeof item.kitchenId !== "string" || !UUID.test(item.kitchenId) ||
      typeof item.kitchenName !== "string" ||
      (item.kitchenDisplayName !== null && typeof item.kitchenDisplayName !== "string") ||
      (item.areaName !== null && typeof item.areaName !== "string") ||
      typeof item.city !== "string" ||
      typeof item.distanceMeters !== "number" || !Number.isFinite(item.distanceMeters) || item.distanceMeters < 0 ||
      typeof item.itemName !== "string" ||
      (item.description !== null && typeof item.description !== "string") ||
      typeof item.category !== "string" ||
      (item.foodType !== "VEG" && item.foodType !== "NON_VEG") ||
      typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0 ||
      typeof item.currency !== "string" ||
      (item.preparationTimeMinutes !== null && (typeof item.preparationTimeMinutes !== "number" || !Number.isInteger(item.preparationTimeMinutes) || item.preparationTimeMinutes < 0)) ||
      (item.primaryImageUrl !== null && typeof item.primaryImageUrl !== "string")
    ) return null;
    items.push(item as AdvancedSearchItem);
  }

  return raw as AdvancedSearchResponse;
}
