import type { FavoriteHomeCard, SavedMenuItem } from "./saved-resolve-contract";

export type SavedTone = "positive" | "attention" | "muted";

function localTime(value: string | null, timeZone: string): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

/** The availability line under a saved dish (same copy as the app). */
export function savedDishAvailability(item: SavedMenuItem): {
  title: string;
  detail: string | null;
  tone: SavedTone;
} {
  const next = localTime(item.nextAvailabilityAt, item.timezoneId);
  switch (item.availabilityState) {
    case "AVAILABLE_NOW":
      return {
        title: "Cooking now",
        detail: "This saved dish is currently available to order.",
        tone: "positive",
      };
    case "COOKING_LATER_TODAY":
      return {
        title: "Cooking later today",
        detail: next ? `Next kitchen window starts around ${next}.` : null,
        tone: "attention",
      };
    case "NOT_TODAY":
      return {
        title: "Not cooking today",
        detail: next ? `Next known kitchen window starts ${next}.` : null,
        tone: "muted",
      };
    case "PAUSED":
      return {
        title: "Kitchen paused",
        detail: next ? `Next known kitchen window starts around ${next}.` : null,
        tone: "attention",
      };
    case "KITCHEN_NOT_ACCEPTING":
      return {
        title: "Not taking orders",
        detail: "We will not guess when this kitchen will reopen.",
        tone: "muted",
      };
    case "ITEM_UNAVAILABLE":
      return {
        title: "Not available right now",
        detail: "The dish is still saved. The catalog does not say why it is unavailable.",
        tone: "muted",
      };
    case "RETIRED":
      return {
        title: "No longer on the menu",
        detail: "Kept here so your saved-food history does not disappear silently.",
        tone: "muted",
      };
    case "KITCHEN_INACTIVE":
      return {
        title: "Kitchen unavailable",
        detail: "This saved dish remains remembered until you remove it.",
        tone: "muted",
      };
    case "MISSING":
      return {
        title: "Dish no longer listed",
        detail: "You can remove this saved item whenever you are ready.",
        tone: "muted",
      };
  }
}

export function isSavedDishCookingToday(item: SavedMenuItem): boolean {
  return (
    item.availabilityState === "AVAILABLE_NOW" || item.availabilityState === "COOKING_LATER_TODAY"
  );
}

export function canOpenSavedDish(item: SavedMenuItem): boolean {
  return item.found && item.itemStatus === "ACTIVE" && item.kitchenStatus === "ACTIVE";
}

export function canAddSavedDish(item: SavedMenuItem): boolean {
  return Boolean(
    item.found &&
    item.availabilityState === "AVAILABLE_NOW" &&
    item.itemStatus === "ACTIVE" &&
    item.itemAvailable &&
    item.kitchenId &&
    item.kitchenStatus === "ACTIVE" &&
    item.acceptingOrders &&
    !item.paused &&
    item.availableNow,
  );
}

export function savedDishName(item: SavedMenuItem): string {
  return item.itemName?.trim() || "Saved dish";
}

export function savedDishKitchenName(item: SavedMenuItem): string {
  return item.kitchenDisplayName?.trim() || item.kitchenName?.trim() || "Home kitchen";
}

export function favoriteHomeName(card: FavoriteHomeCard): string {
  return card.displayName?.trim() || card.kitchenName?.trim() || "Saved home kitchen";
}

const HOME_STATE: Record<FavoriteHomeCard["cookingState"], { title: string; tone: SavedTone }> = {
  COOKING_NOW: { title: "Cooking now", tone: "positive" },
  COOKING_LATER_TODAY: { title: "Cooking later today", tone: "positive" },
  PAUSED: { title: "Kitchen paused", tone: "attention" },
  NOT_ACCEPTING: { title: "Not taking orders", tone: "attention" },
  NOT_TODAY: { title: "Not cooking today", tone: "muted" },
  INACTIVE: { title: "Kitchen unavailable", tone: "muted" },
  MISSING: { title: "Home kitchen no longer listed", tone: "muted" },
};

export function favoriteHomeState(card: FavoriteHomeCard): { title: string; tone: SavedTone } {
  return HOME_STATE[card.cookingState];
}

function homeCookingToday(card: FavoriteHomeCard): boolean {
  return card.cookingState === "COOKING_NOW" || card.cookingState === "COOKING_LATER_TODAY";
}

/** One saved home: the card to show plus each saved relation behind it, so removing clears both. */
export type SavedHomeEntry = {
  card: FavoriteHomeCard;
  kitchenId: string | null;
  chefIdentityId: string | null;
};

/** Saved kitchens and saved chefs in one list: a chef whose kitchen is also saved shows once; homes cooking today come first. */
export function mergeSavedHomes(
  kitchenCards: readonly FavoriteHomeCard[],
  chefCards: readonly FavoriteHomeCard[],
): SavedHomeEntry[] {
  const entries: SavedHomeEntry[] = kitchenCards.map((card) => ({
    card,
    kitchenId: card.requestedId,
    chefIdentityId: null,
  }));
  for (const card of chefCards) {
    const same = entries.find(
      (entry) =>
        (entry.card.chefIdentityId !== null && entry.card.chefIdentityId === card.requestedId) ||
        (card.kitchenId !== null && entry.kitchenId === card.kitchenId),
    );
    if (same) same.chefIdentityId = card.requestedId;
    else entries.push({ card, kitchenId: null, chefIdentityId: card.requestedId });
  }
  return entries.sort(
    (a, b) => Number(homeCookingToday(b.card)) - Number(homeCookingToday(a.card)),
  );
}

export type WatchKey = `${"CHEF" | "KITCHEN"}:${string}`;
export type WatchChange = { entityType: "CHEF" | "KITCHEN"; entityId: string; enabled: boolean };

/** The bell: when any alert behind the row is on, it turns them all off; else it turns on the kitchen's (or the chef's). */
export function watchChanges(entry: SavedHomeEntry, watched: ReadonlySet<WatchKey>): WatchChange[] {
  const behind: Omit<WatchChange, "enabled">[] = [];
  if (entry.kitchenId) behind.push({ entityType: "KITCHEN", entityId: entry.kitchenId });
  if (entry.chefIdentityId) behind.push({ entityType: "CHEF", entityId: entry.chefIdentityId });
  const on = behind.filter(({ entityType, entityId }) => watched.has(`${entityType}:${entityId}`));
  return on.length
    ? on.map((watch) => ({ ...watch, enabled: false }))
    : behind.slice(0, 1).map((watch) => ({ ...watch, enabled: true }));
}

export function isWatched(entry: SavedHomeEntry, watched: ReadonlySet<WatchKey>): boolean {
  return watchChanges(entry, watched).some((change) => !change.enabled);
}

/** Splits ids into backend-sized batches. */
export function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size)
    chunks.push(values.slice(offset, offset + size));
  return chunks;
}
