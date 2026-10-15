// Mirrors user-chef-service CustomerHomeFavoriteDtos. Browser-safe.
export type FavoriteKitchen = { kitchenId: string; createdAt: string };
export type FavoriteChef = { chefIdentityId: string; createdAt: string };
export type FavoritePage<T> = { items: T[]; nextCursor: string | null };
export type FavoriteWatchEntityType = "CHEF" | "KITCHEN";
export type FavoriteWatch = {
  entityType: FavoriteWatchEntityType;
  entityId: string;
  channel: "IN_APP" | "PUSH";
  enabled: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE = 100; // the backend's MAX_PAGE_SIZE

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}
function instant(value: unknown): string | null {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function parseFavoriteKitchen(value: unknown): FavoriteKitchen | null {
  const raw = record(value), kitchenId = uuid(raw?.kitchenId), createdAt = instant(raw?.createdAt);
  return kitchenId && createdAt ? { kitchenId, createdAt } : null;
}

export function parseFavoriteChef(value: unknown): FavoriteChef | null {
  const raw = record(value), chefIdentityId = uuid(raw?.chefIdentityId), createdAt = instant(raw?.createdAt);
  return chefIdentityId && createdAt ? { chefIdentityId, createdAt } : null;
}

function page<T>(value: unknown, item: (value: unknown) => T | null): FavoritePage<T> | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.items) || raw.items.length > MAX_PAGE) return null;
  const items = raw.items.map(item);
  const nextCursor = raw.nextCursor == null ? null : typeof raw.nextCursor === "string" && raw.nextCursor.length >= 1 && raw.nextCursor.length <= 512 ? raw.nextCursor : undefined;
  return items.some(entry => entry === null) || nextCursor === undefined ? null : { items: items as T[], nextCursor };
}

export function parseFavoriteKitchenPage(value: unknown): FavoritePage<FavoriteKitchen> | null {
  return page(value, parseFavoriteKitchen);
}

export function parseFavoriteChefPage(value: unknown): FavoritePage<FavoriteChef> | null {
  return page(value, parseFavoriteChef);
}

export function parseFavoriteWatch(value: unknown): FavoriteWatch | null {
  const raw = record(value);
  if (!raw) return null;
  const entityId = uuid(raw.entityId), createdAt = instant(raw.createdAt), updatedAt = instant(raw.updatedAt);
  const lastNotifiedAt = raw.lastNotifiedAt == null ? null : instant(raw.lastNotifiedAt);
  if ((raw.entityType !== "CHEF" && raw.entityType !== "KITCHEN") || !entityId || (raw.channel !== "IN_APP" && raw.channel !== "PUSH") || typeof raw.enabled !== "boolean" || (raw.lastNotifiedAt != null && !lastNotifiedAt) || !createdAt || !updatedAt) return null;
  return { entityType: raw.entityType, entityId, channel: raw.channel, enabled: raw.enabled, lastNotifiedAt, createdAt, updatedAt };
}

export function parseFavoriteWatches(value: unknown): FavoriteWatch[] | null {
  if (!Array.isArray(value) || value.length > MAX_PAGE) return null;
  const watches = value.map(parseFavoriteWatch);
  return watches.some(watch => watch === null) ? null : watches as FavoriteWatch[];
}
