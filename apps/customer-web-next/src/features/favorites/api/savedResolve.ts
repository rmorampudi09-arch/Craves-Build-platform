import {
  parseFavoriteHomeCards,
  parseSavedMenuItems,
  RESOLVE_BATCH_SIZE,
  type FavoriteHomeCard,
  type SavedMenuItem,
} from "@/features/favorites/lib/saved-resolve-contract";
import { chunk } from "@/features/favorites/lib/saved-presentation";
import { sessionFetch } from "@/shared/lib/session-fetch";

/** code is FEATURE_NOT_AVAILABLE (show Coming soon), SESSION_EXPIRED, a backend code, or SAVED_RESOLVE_FAILED. */
export class SavedResolveError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

async function post<T>(
  path: string,
  body: unknown,
  parse: (value: unknown) => { items: T[] } | null,
): Promise<T[]> {
  const response = await sessionFetch(path, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = (json as { code?: unknown } | null)?.code;
    throw new SavedResolveError(
      typeof code === "string" ? code : "SAVED_RESOLVE_FAILED",
      response.status,
    );
  }
  const parsed = parse(json);
  if (!parsed) throw new SavedResolveError("INVALID_SAVED_RESOLVE_RESPONSE", 502);
  return parsed.items;
}

function inOrder<T>(keys: readonly string[], items: readonly T[], key: (item: T) => string): T[] {
  const byKey = new Map(items.map((item) => [key(item), item]));
  return keys.map((wanted) => {
    const item = byKey.get(wanted);
    if (!item) throw new SavedResolveError("INCOMPLETE_SAVED_RESOLVE_RESPONSE", 502);
    return item;
  });
}

/** Today's facts for each saved dish, in the order given, 100 per request. */
export async function resolveSavedMenuItems(
  menuItemIds: readonly string[],
): Promise<SavedMenuItem[]> {
  const ids = [...new Set(menuItemIds)];
  const batches = await Promise.all(
    chunk(ids, RESOLVE_BATCH_SIZE).map((batch) =>
      post("/api/discovery/saved/menu-items/resolve", { menuItemIds: batch }, parseSavedMenuItems),
    ),
  );
  return inOrder(ids, batches.flat(), (item) => item.menuItemId);
}

/** Who among the saved chefs and kitchens is cooking today: one card per saved relation, 100 per request. */
export async function resolveFavoriteHomes(
  chefIdentityIds: readonly string[],
  kitchenIds: readonly string[],
): Promise<FavoriteHomeCard[]> {
  const keys = [
    ...new Set([
      ...chefIdentityIds.map((id) => `CHEF:${id}`),
      ...kitchenIds.map((id) => `KITCHEN:${id}`),
    ]),
  ];
  const batches = await Promise.all(
    chunk(keys, RESOLVE_BATCH_SIZE).map((batch) => {
      const ids = (type: string) =>
        batch.filter((key) => key.startsWith(type)).map((key) => key.slice(type.length));
      return post(
        "/api/discovery/favorites/home/resolve",
        { chefIdentityIds: ids("CHEF:"), kitchenIds: ids("KITCHEN:") },
        parseFavoriteHomeCards,
      );
    }),
  );
  return inOrder(keys, batches.flat(), (card) => `${card.requestedType}:${card.requestedId}`);
}
