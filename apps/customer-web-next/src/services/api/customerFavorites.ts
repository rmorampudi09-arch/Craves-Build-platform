import {
  parseCustomerFavorite,
  parseCustomerFavorites,
} from "@/lib/customer-favorites-contract";

const listeners = new Set<() => void>();
let favoriteIds = new Set<string>();
let favoritesLoaded = false;
let loadPromise: Promise<Set<string>> | null = null;

async function responseMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  if (
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string" &&
    body.message.trim()
  ) {
    return body.message;
  }
  return fallback;
}

function notify() {
  for (const listener of listeners) listener();
}

function setFavoriteIds(next: Set<string>) {
  favoriteIds = new Set(next);
  favoritesLoaded = true;
  notify();
}

export function getCustomerFavoriteIds(): Set<string> {
  return new Set(favoriteIds);
}

export function customerFavoritesLoaded(): boolean {
  return favoritesLoaded;
}

export function subscribeCustomerFavorites(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadCustomerFavoriteIds(): Promise<Set<string>> {
  if (favoritesLoaded) return getCustomerFavoriteIds();
  if (loadPromise) return loadPromise.then((ids) => new Set(ids));

  loadPromise = (async () => {
    const response = await fetch("/api/customer/favorites", {
      method: "GET",
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
          : "Favorites are temporarily unavailable.";
      throw new Error(message);
    }

    const favorites = parseCustomerFavorites(body);
    if (!favorites) throw new Error("Craves returned an invalid favorites response.");
    const next = new Set(favorites.map((favorite) => favorite.menuItemId));
    setFavoriteIds(next);
    return next;
  })();

  try {
    return new Set(await loadPromise);
  } finally {
    loadPromise = null;
  }
}

export async function saveCustomerFavorite(menuItemId: string): Promise<void> {
  const response = await fetch(
    `/api/customer/favorites/${encodeURIComponent(menuItemId)}`,
    {
      method: "PUT",
      credentials: "same-origin",
    },
  );
  if (!response.ok) {
    throw new Error(await responseMessage(response, "This dish could not be saved."));
  }

  const favorite = parseCustomerFavorite(await response.json().catch(() => null));
  if (!favorite || favorite.menuItemId !== menuItemId) {
    throw new Error("Craves returned an invalid favorites response.");
  }

  favoriteIds = new Set(favoriteIds).add(menuItemId);
  notify();
}

export async function removeCustomerFavorite(menuItemId: string): Promise<void> {
  const response = await fetch(
    `/api/customer/favorites/${encodeURIComponent(menuItemId)}`,
    {
      method: "DELETE",
      credentials: "same-origin",
    },
  );
  if (!response.ok) {
    throw new Error(await responseMessage(response, "This dish could not be removed from favorites."));
  }

  if (favoriteIds.has(menuItemId)) {
    const next = new Set(favoriteIds);
    next.delete(menuItemId);
    favoriteIds = next;
    notify();
  }
}

const LEGACY_WISHLIST_KEY = "craves.wishlist";
const MENU_ITEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let legacyMigration: Promise<void> | null = null;

/**
 * Moves dishes saved by the old on-device wishlist to the account, once per
 * page load. Anything that can't be saved yet stays on the device for the next try.
 */
export function migrateLegacyWishlist(): Promise<void> {
  legacyMigration ??= (async () => {
    let stored: unknown = null;
    try {
      stored = JSON.parse(window.localStorage.getItem(LEGACY_WISHLIST_KEY) ?? "null");
    } catch {
      // Unreadable legacy data has nothing to migrate.
    }
    const ids = Array.isArray(stored)
      ? [...new Set(stored.map((item) => (item as { id?: unknown } | null)?.id))].filter(
          (id): id is string => typeof id === "string" && MENU_ITEM_ID.test(id),
        )
      : [];
    if (ids.length === 0) {
      window.localStorage.removeItem(LEGACY_WISHLIST_KEY);
      return;
    }

    const saved = await loadCustomerFavoriteIds(); // Throws while signed out: keep the device list.
    const remaining: string[] = [];
    for (const id of ids) {
      if (saved.has(id)) continue;
      await saveCustomerFavorite(id).catch(() => remaining.push(id));
    }
    if (remaining.length) {
      window.localStorage.setItem(LEGACY_WISHLIST_KEY, JSON.stringify(remaining.map((id) => ({ id }))));
    } else {
      window.localStorage.removeItem(LEGACY_WISHLIST_KEY);
    }
  })().catch(() => {
    legacyMigration = null;
  });
  return legacyMigration;
}
