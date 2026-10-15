import { z } from "zod";
import { safeChefPhotoUrl } from "@/shared/lib/chef-photo";

// Mirrors catalog-service SavedMenuItemDtos and FavoriteHomeFeedDtos (only the fields Saved shows).
export const RESOLVE_BATCH_SIZE = 100; // the backend's MAX_BATCH_SIZE / MAX_RELATIONSHIPS_PER_REQUEST

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID);
const text = z.string().max(400).nullable();
const instant = z
  .string()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)));
const ids = z.array(uuid).max(RESOLVE_BATCH_SIZE);

export const savedMenuItemsRequest = z.object({ menuItemIds: ids.min(1) }).strict();
export const favoriteHomesRequest = z
  .object({ chefIdentityIds: ids, kitchenIds: ids })
  .strict()
  .refine(
    (body) =>
      body.chefIdentityIds.length + body.kitchenIds.length >= 1 &&
      body.chefIdentityIds.length + body.kitchenIds.length <= RESOLVE_BATCH_SIZE,
  );

const savedItem = z.object({
  menuItemId: uuid,
  found: z.boolean(),
  availabilityState: z.enum([
    "AVAILABLE_NOW",
    "COOKING_LATER_TODAY",
    "NOT_TODAY",
    "PAUSED",
    "KITCHEN_NOT_ACCEPTING",
    "ITEM_UNAVAILABLE",
    "RETIRED",
    "KITCHEN_INACTIVE",
    "MISSING",
  ]),
  itemName: text,
  price: z.number().finite().nonnegative().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  itemStatus: text,
  itemAvailable: z.boolean(),
  kitchenId: uuid.nullable(),
  kitchenName: text,
  kitchenDisplayName: text,
  kitchenStatus: text,
  // Only an https picture may be shown; anything else becomes "no photo".
  primaryImageUrl: z.string().max(2000).nullable().transform(safeChefPhotoUrl),
  timezoneId: z.string().min(1).max(64),
  acceptingOrders: z.boolean(),
  paused: z.boolean(),
  availableNow: z.boolean(),
  nextAvailabilityAt: instant.nullable(),
});

const homeCard = z.object({
  requestedType: z.enum(["CHEF", "KITCHEN"]),
  requestedId: uuid,
  exists: z.boolean(),
  kitchenId: uuid.nullable(),
  chefIdentityId: uuid.nullable(),
  kitchenName: text,
  displayName: text,
  areaName: text,
  city: text,
  cookingState: z.enum([
    "COOKING_NOW",
    "COOKING_LATER_TODAY",
    "NOT_TODAY",
    "PAUSED",
    "NOT_ACCEPTING",
    "INACTIVE",
    "MISSING",
  ]),
});

const savedItemsResponse = z.object({ items: z.array(savedItem).max(RESOLVE_BATCH_SIZE) });
const homeCardsResponse = z.object({ items: z.array(homeCard).max(RESOLVE_BATCH_SIZE) });

export type SavedMenuItem = z.infer<typeof savedItem>;
export type SavedAvailabilityState = SavedMenuItem["availabilityState"];
export type FavoriteHomeCard = z.infer<typeof homeCard>;

export function parseSavedMenuItems(value: unknown): { items: SavedMenuItem[] } | null {
  const parsed = savedItemsResponse.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseFavoriteHomeCards(value: unknown): { items: FavoriteHomeCard[] } | null {
  const parsed = homeCardsResponse.safeParse(value);
  return parsed.success ? parsed.data : null;
}
