const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AVAILABILITY_STATES = [
  "AVAILABLE_NOW",
  "COOKING_LATER_TODAY",
  "NOT_TODAY",
  "PAUSED",
  "KITCHEN_NOT_ACCEPTING",
  "ITEM_UNAVAILABLE",
  "RETIRED",
  "KITCHEN_INACTIVE",
  "MISSING",
] as const;

export type SavedAvailabilityState = (typeof AVAILABILITY_STATES)[number];

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
  foodType: "VEG" | "NON_VEG" | "EGG";
  price: number;
  currency: string;
  primaryImageUrl: string | null;
  availabilityState: SavedAvailabilityState;
  availableNow: boolean;
  nextAvailabilityAt: string | null;
  reasonCode: "SAVED_BY_YOU";
};

function isAvailabilityState(value: unknown): value is SavedAvailabilityState {
  return typeof value === "string" && (AVAILABILITY_STATES as readonly string[]).includes(value);
}

function validOptionalDate(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

export function mapSavedResolverToPersonalisedRecommendations(
  value: unknown,
): PersonalisedRecommendation[] | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.items) || raw.items.length > 20) return null;

  const recommendations: PersonalisedRecommendation[] = [];
  for (const value of raw.items) {
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    if (
      typeof item.menuItemId !== "string" ||
      !UUID.test(item.menuItemId) ||
      typeof item.found !== "boolean" ||
      !isAvailabilityState(item.availabilityState) ||
      typeof item.itemAvailable !== "boolean" ||
      typeof item.availableNow !== "boolean" ||
      !validOptionalDate(item.nextAvailabilityAt)
    ) {
      return null;
    }

    if (!item.found) continue;

    if (
      typeof item.kitchenId !== "string" ||
      !UUID.test(item.kitchenId) ||
      typeof item.kitchenName !== "string" ||
      (item.kitchenDisplayName !== null && typeof item.kitchenDisplayName !== "string") ||
      (item.areaName !== null && typeof item.areaName !== "string") ||
      (item.city !== null && typeof item.city !== "string") ||
      typeof item.itemName !== "string" ||
      (item.description !== null && typeof item.description !== "string") ||
      typeof item.category !== "string" ||
      (item.foodType !== "VEG" && item.foodType !== "NON_VEG" && item.foodType !== "EGG") ||
      typeof item.price !== "number" ||
      !Number.isFinite(item.price) ||
      item.price < 0 ||
      typeof item.currency !== "string" ||
      item.currency.length !== 3 ||
      (item.primaryImageUrl !== null && typeof item.primaryImageUrl !== "string")
    ) {
      return null;
    }

    recommendations.push({
      menuItemId: item.menuItemId,
      kitchenId: item.kitchenId,
      kitchenName: item.kitchenName,
      kitchenDisplayName: item.kitchenDisplayName as string | null,
      areaName: item.areaName as string | null,
      city: item.city as string | null,
      itemName: item.itemName,
      description: item.description as string | null,
      category: item.category,
      foodType: item.foodType,
      price: item.price,
      currency: item.currency,
      primaryImageUrl: item.primaryImageUrl as string | null,
      availabilityState: item.availabilityState,
      availableNow: item.availableNow,
      nextAvailabilityAt: item.nextAvailabilityAt as string | null,
      reasonCode: "SAVED_BY_YOU",
    });
  }

  return recommendations;
}
