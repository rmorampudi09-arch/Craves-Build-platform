import {
  parseMenuDiscovery,
  type NearbyMenuItem,
} from "@/lib/discovery-contract";
import type { PublicMenuItemDetail } from "@/lib/public-menu-item-contract";
import { candidateDiscoveryRadii } from "@/lib/catalog-discovery-policy";

export type Dish = {
  id: string;
  name: string;
  chef: string;
  category: string;
  img: string;
  images?: string[];
  imageIsPlaceholder?: boolean;
  detailsLoaded?: boolean;
  price: number;
  rating: number;
  time: string;
  veg: boolean;
  foodType?: "VEG" | "NON_VEG" | "EGG";
  tag?: string;
  desc: string;
  kitchenDescription?: string;
  ingredients?: string[];
  serves?: string;
  originalPrice?: number;
  spiceLevel?: "Mild" | "Medium" | "Hot";
  reviewCount?: number;
  reviews?: { name: string; rating: number; daysAgo: number; text: string }[];
  kitchenId?: string;
  currency?: string;
  distanceMeters?: number;
  areaName?: string;
  city?: string;
  state?: string;
};

const PLACEHOLDER_IMAGE = "/brand/craves-logo.svg";
let discoveredDishes: Dish[] = [];
let discoveryRadiusMeters = 5_000;

function spiceLabel(
  value: NearbyMenuItem["spiceLevel"] | PublicMenuItemDetail["spiceLevel"],
): Dish["spiceLevel"] {
  if (value === "SPICY") return "Hot";
  if (value === "MEDIUM") return "Medium";
  if (value === "MILD") return "Mild";
  return undefined;
}

function servesLabel(value: number | null): string | undefined {
  return value
    ? `${value} ${value === 1 ? "person" : "people"}`
    : undefined;
}

function prepTimeLabel(value: number | null | undefined): string {
  if (!value) return "Prepared after ordering";
  // Long values are usually catalog-entry mistakes and should not dominate the
  // customer UI. Keep the item orderable while the source data is corrected.
  if (value > 240) return "Made to order";
  return `${value} min`;
}

function descriptionLabel(
  description: string | null | undefined,
  name: string,
  category: string,
  kitchenName: string,
): string {
  const provided = description?.trim();
  if (provided) return provided;

  const categoryLabel = category.trim().toLowerCase();
  return `${name} is a ${categoryLabel} dish from ${kitchenName}, available to order on Craves.`;
}

function mapNearbyItem(item: NearbyMenuItem): Dish {
  const chef = item.kitchenDisplayName || item.kitchenName;
  const image = item.primaryImageUrl || PLACEHOLDER_IMAGE;
  return {
    id: item.id,
    kitchenId: item.kitchenId,
    name: item.itemName,
    chef,
    category: item.category,
    img: image,
    images: item.primaryImageUrl ? [item.primaryImageUrl] : [],
    imageIsPlaceholder: !item.primaryImageUrl,
    detailsLoaded: false,
    price: item.price,
    currency: item.currency,
    rating: 0,
    time: prepTimeLabel(item.preparationTimeMinutes),
    veg: item.foodType === "VEG",
    foodType: item.foodType,
    desc: descriptionLabel(item.description, item.itemName, item.category, chef),
    serves: servesLabel(item.servesCount),
    spiceLevel: spiceLabel(item.spiceLevel),
    distanceMeters: item.distanceMeters,
    areaName: item.areaName ?? undefined,
    city: item.city,
    state: item.state,
  };
}

function isPublicDetail(value: unknown): value is PublicMenuItemDetail {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.id === "string" &&
    typeof raw.kitchenId === "string" &&
    typeof raw.kitchenName === "string" &&
    typeof raw.itemName === "string" &&
    typeof raw.category === "string" &&
    typeof raw.foodType === "string" &&
    typeof raw.price === "number" &&
    Number.isFinite(raw.price) &&
    typeof raw.currency === "string" &&
    Array.isArray(raw.imageUrls)
  );
}

function mapDetail(item: PublicMenuItemDetail): Dish {
  const chef = item.kitchenDisplayName || item.kitchenName;
  const image = item.primaryImageUrl || PLACEHOLDER_IMAGE;
  return {
    id: item.id,
    kitchenId: item.kitchenId,
    name: item.itemName,
    chef,
    category: item.category,
    img: image,
    images: item.imageUrls,
    imageIsPlaceholder: !item.primaryImageUrl,
    detailsLoaded: true,
    price: item.price,
    currency: item.currency,
    rating: 0,
    time: prepTimeLabel(item.preparationTimeMinutes),
    veg: item.foodType === "VEG",
    foodType: item.foodType,
    desc: descriptionLabel(item.description, item.itemName, item.category, chef),
    kitchenDescription: item.kitchenDescription ?? undefined,
    serves: servesLabel(item.servesCount),
    spiceLevel: spiceLabel(item.spiceLevel),
    areaName: item.areaName ?? undefined,
    city: item.city ?? undefined,
    state: item.state ?? undefined,
  };
}

function remember(dish: Dish): Dish {
  discoveredDishes = [
    dish,
    ...discoveredDishes.filter((existing) => existing.id !== dish.id),
  ];
  return dish;
}

export async function discoverDishes(
  latitude: number,
  longitude: number,
  radiusMeters = 5_000,
): Promise<Dish[]> {
  for (const candidateRadius of candidateDiscoveryRadii(radiusMeters)) {
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      radiusMeters: String(candidateRadius),
      page: "0",
      size: "50",
    });
    const response = await fetch(`/api/discovery/menu-items?${query}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        body &&
        typeof body === "object" &&
        "message" in body &&
        typeof body.message === "string"
          ? body.message
          : "Nearby dishes are temporarily unavailable.";
      throw new Error(message);
    }
    const payload = parseMenuDiscovery(body);
    if (!payload) throw new Error("Craves returned an invalid discovery response.");
    discoveredDishes = payload.menuItems.map(mapNearbyItem);
    discoveryRadiusMeters = candidateRadius;
    if (discoveredDishes.length > 0) return [...discoveredDishes];
  }
  return [];
}

export async function loadKitchenMenu(kitchenId: string): Promise<Dish[]> {
  const response = await fetch(
    `/api/catalog/kitchens/${encodeURIComponent(kitchenId)}/menu-items`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "This kitchen's menu is temporarily unavailable.";
    throw new Error(message);
  }

  if (!Array.isArray(body) || body.length > 500 || !body.every(isPublicDetail)) {
    throw new Error("Craves returned an invalid kitchen menu response.");
  }

  const loaded = body.map(mapDetail);
  const loadedIds = new Set(loaded.map((dish) => dish.id));
  discoveredDishes = [
    ...loaded,
    ...discoveredDishes.filter((existing) => !loadedIds.has(existing.id)),
  ];
  return loaded;
}

export async function loadDish(id: string): Promise<Dish> {
  const cached = getDish(id);
  if (cached?.detailsLoaded) return cached;

  const response = await fetch(`/api/catalog/menu-items/${encodeURIComponent(id)}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "This dish could not be loaded.";
    throw new Error(message);
  }
  if (!isPublicDetail(body)) throw new Error("Craves returned an invalid dish response.");
  return remember(mapDetail(body));
}

export function getDiscoveryRadiusMeters(): number {
  return discoveryRadiusMeters;
}

export function allDishes(): Dish[] {
  return [...discoveredDishes];
}

export function clearDishDiscoveryCache(): void {
  discoveredDishes = [];
  discoveryRadiusMeters = 5_000;
}

export function getDish(id: string): Dish | undefined {
  return discoveredDishes.find((dish) => dish.id === id);
}

export function getSimilarDishes(dish: Dish, limit = 4): Dish[] {
  const sameKitchen = discoveredDishes.filter(
    (candidate) =>
      candidate.id !== dish.id &&
      Boolean(dish.kitchenId) &&
      candidate.kitchenId === dish.kitchenId,
  );
  const sameCategory = discoveredDishes.filter(
    (candidate) =>
      candidate.id !== dish.id &&
      candidate.category === dish.category &&
      candidate.kitchenId !== dish.kitchenId,
  );

  return [...sameKitchen, ...sameCategory]
    .filter(
      (candidate, index, items) =>
        items.findIndex((item) => item.id === candidate.id) === index,
    )
    .slice(0, limit);
}
