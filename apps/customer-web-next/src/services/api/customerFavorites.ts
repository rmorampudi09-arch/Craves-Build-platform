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
