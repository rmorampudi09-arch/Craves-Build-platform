import {
  parseCustomerFavorite,
  parseCustomerFavorites,
} from "@/lib/customer-favorites-contract";

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

export async function loadCustomerFavoriteIds(): Promise<Set<string>> {
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
  return new Set(favorites.map((favorite) => favorite.menuItemId));
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
}
