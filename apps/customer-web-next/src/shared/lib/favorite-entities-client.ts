import {
  parseFavoriteChefPage,
  parseFavoriteKitchenPage,
  parseFavoriteWatch,
  parseFavoriteWatches,
  type FavoriteChef,
  type FavoriteKitchen,
  type FavoritePage,
  type FavoriteWatch,
  type FavoriteWatchEntityType,
} from "./favorite-entities-contract";
import { sessionFetch } from "./session-fetch";

/** code is FEATURE_NOT_AVAILABLE (show Coming soon), SESSION_EXPIRED, a backend code, or FAVORITE_ENTITY_FAILED. */
export class FavoriteEntityError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

async function call<T>(path: string, parse: (value: unknown) => T | null, init: RequestInit = {}): Promise<T> {
  const response = await sessionFetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = response.status === 401 ? "SESSION_EXPIRED" : (body as { code?: unknown } | null)?.code;
    throw new FavoriteEntityError(typeof code === "string" ? code : "FAVORITE_ENTITY_FAILED", response.status);
  }
  const parsed = parse(body);
  if (parsed === null) throw new FavoriteEntityError("INVALID_FAVORITE_RESPONSE", 502);
  return parsed;
}

const done = () => true;

export function listFavoriteKitchens(): Promise<FavoritePage<FavoriteKitchen>> {
  return call("/api/customer/favorite-kitchens", parseFavoriteKitchenPage);
}

export async function setFavoriteKitchen(kitchenId: string, saved: boolean): Promise<void> {
  await call(`/api/customer/favorite-kitchens/${encodeURIComponent(kitchenId)}`, done, { method: saved ? "PUT" : "DELETE" });
}

export function listFavoriteChefs(): Promise<FavoritePage<FavoriteChef>> {
  return call("/api/customer/favorite-chefs", parseFavoriteChefPage);
}

export async function setFavoriteChef(chefIdentityId: string, saved: boolean): Promise<void> {
  await call(`/api/customer/favorite-chefs/${encodeURIComponent(chefIdentityId)}`, done, { method: saved ? "PUT" : "DELETE" });
}

export function listFavoriteWatches(entityType: FavoriteWatchEntityType): Promise<FavoriteWatch[]> {
  return call(`/api/customer/favorite-watches?entityType=${entityType}`, parseFavoriteWatches);
}

/** Turns in-app notifications about a saved chef or kitchen on or off. */
export function setFavoriteWatch(entityType: FavoriteWatchEntityType, entityId: string, enabled: boolean): Promise<FavoriteWatch> {
  return call(`/api/customer/favorite-watches/${entityType}/${encodeURIComponent(entityId)}`, parseFavoriteWatch, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}
