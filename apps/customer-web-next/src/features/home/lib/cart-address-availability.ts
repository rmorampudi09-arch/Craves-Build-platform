import { useEffect, useState } from "react";
import { clearCart, removeFromCart, type CartItem } from "@/features/cart/api/cravesCart";
import { loadKitchenMenu } from "@/features/dish/api/dishes";
import {
  DEFAULT_DISCOVERY_RADIUS_METERS,
  MAX_DISCOVERY_RADIUS_METERS,
} from "@/features/home/lib/catalog-discovery-policy";
import { parseKitchenDiscovery } from "@/features/home/lib/discovery-contract";

/** Remembered for the browser session, so a dismissed notice doesn't return on every visit. */
const DISMISSED_KEY = "craves-cart-availability-dismissed";

type CartLine = Pick<CartItem, "kitchenId" | "menuItemId">;
type MenuReader = (kitchenId: string) => Promise<readonly { id: string }[]>;
export type DeliveryPlace = { id?: string; lat?: number | null; lng?: number | null } | null;

/** Cart and checkout read menus without adding them to the dishes Home lists. */
const readMenuOnly: MenuReader = (kitchenId) => loadKitchenMenu(kitchenId, { remember: false });

/** "Flat 302, Road 12, Banjara Hills, Hyderabad": a delivery address the way Home's header shows it. */
export function deliveryPlaceLabel(address: { hno?: string; street?: string; mandal?: string; city?: string }): string {
  return Array.from(
    new Set(
      [address.hno, address.street, address.mandal, address.city]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part)),
    ),
  ).join(", ");
}

/**
 * The cart dishes (menu item ids) that can't reach a delivery address: every dish of a kitchen
 * outside delivery reach, otherwise dishes their kitchen no longer has on its menu. A menu that
 * fails to load flags nothing.
 */
export async function unavailableMenuItemIds(
  lines: readonly CartLine[],
  nearbyKitchenIds: ReadonlySet<string>,
  nearbyDishIds: ReadonlySet<string>,
  readMenu: MenuReader,
): Promise<Set<string>> {
  const outOfRange = lines.filter((line) => !nearbyKitchenIds.has(line.kitchenId));
  if (outOfRange.length > 0) return new Set(outOfRange.map((line) => line.menuItemId));

  const unresolved = lines.filter((line) => !nearbyDishIds.has(line.menuItemId));
  const menus = new Map(
    await Promise.all(
      [...new Set(unresolved.map((line) => line.kitchenId))].map(async (kitchenId) => {
        try {
          return [kitchenId, new Set((await readMenu(kitchenId)).map((dish) => dish.id))] as const;
        } catch {
          return [kitchenId, null] as const;
        }
      }),
    ),
  );
  return new Set(
    unresolved
      .filter((line) => menus.get(line.kitchenId)?.has(line.menuItemId) === false)
      .map((line) => line.menuItemId),
  );
}

/** Kitchens within delivery reach of a place, or null when that can't be told. Leaves Home's discovery cache alone. */
export async function kitchensWithinReach(
  lat: number,
  lng: number,
  cartKitchenIds: readonly string[],
): Promise<Set<string> | null> {
  const query = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    radiusMeters: String(DEFAULT_DISCOVERY_RADIUS_METERS),
    page: "0",
    size: "50",
  });
  const response = await fetch(`/api/discovery/kitchens?${query}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = response.ok ? parseKitchenDiscovery(await response.json().catch(() => null)) : null;
  if (!payload) return null;
  const ids = new Set(
    payload.kitchens
      .filter((kitchen) => kitchen.distanceMeters <= MAX_DISCOVERY_RADIUS_METERS)
      .map((kitchen) => kitchen.id),
  );
  // shortcut: reads the 50 nearest kitchens only, so a cart kitchen past them counts as unknown, never unavailable; page further once more than 50 kitchens sit within reach.
  return payload.page.hasNext && cartKitchenIds.some((id) => !ids.has(id)) ? null : ids;
}

/**
 * Which cart dishes can reach the delivery address, for Home, the cart and checkout. Home passes
 * the kitchens and dishes it already discovered there; elsewhere the kitchens are looked up. A
 * failed lookup flags nothing, so a network problem never blocks the cart or payment.
 */
export function useCartAddressAvailability({
  items,
  address,
  nearbyKitchenIds,
  nearbyDishIds,
  readMenu = readMenuOnly,
}: {
  items: CartItem[];
  /** null while the address (or what Home discovered for it) isn't ready: nothing is checked. */
  address: DeliveryPlace;
  nearbyKitchenIds?: ReadonlySet<string>;
  nearbyDishIds?: ReadonlySet<string>;
  readMenu?: MenuReader;
}) {
  const lat = address?.lat;
  const lng = address?.lng;
  const place = typeof lat === "number" && typeof lng === "number" ? `${lat},${lng}` : "";
  // Quantities don't change what can be delivered: re-check only when the dishes or the address change.
  const lineKey = items.map((item) => `${item.kitchenId}/${item.menuItemId}`).sort().join(" ");
  const [result, setResult] = useState<{ place: string; ids: ReadonlySet<string> }>({ place: "", ids: new Set() });
  const [dismissedKey, setDismissedKey] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : window.sessionStorage.getItem(DISMISSED_KEY);
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (typeof lat !== "number" || typeof lng !== "number" || !lineKey) return;
    let active = true;
    const lines = lineKey.split(" ").map((line) => {
      const [kitchenId, menuItemId] = line.split("/");
      return { kitchenId, menuItemId };
    });
    void (async () => {
      const kitchenIds =
        nearbyKitchenIds ?? (await kitchensWithinReach(lat, lng, lines.map((line) => line.kitchenId)));
      const ids = kitchenIds
        ? await unavailableMenuItemIds(lines, kitchenIds, nearbyDishIds ?? new Set(), readMenu)
        : new Set<string>();
      if (active) setResult({ place: `${lat},${lng}`, ids });
    })().catch(() => {
      if (active) setResult({ place: `${lat},${lng}`, ids: new Set() });
    });
    return () => {
      active = false;
    };
  }, [lat, lng, lineKey, nearbyKitchenIds, nearbyDishIds, readMenu]);

  // A result for another address never shows: switching addresses waits for its own answer.
  const unavailableItems = place && result.place === place ? items.filter((item) => result.ids.has(item.menuItemId)) : [];
  const dismissKey = unavailableItems.length > 0
    ? `${address?.id ?? `${lat ?? ""}:${lng ?? ""}`}|${unavailableItems.map((item) => item.id).sort().join(",")}`
    : null;

  async function resolve() {
    if (unavailableItems.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (unavailableItems.length === items.length) {
        await clearCart();
      } else {
        for (const item of unavailableItems) await removeFromCart(item.id);
      }
      setDismissedKey(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your cart could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (!dismissKey) return;
    setDismissedKey(dismissKey);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, dismissKey);
    } catch {
      // Private mode: the dismissal still holds for this page view.
    }
  }

  return {
    unavailableItems,
    /** Not dismissed for this address and these dishes. */
    open: Boolean(dismissKey && dismissKey !== dismissedKey),
    busy,
    error,
    resolve,
    dismiss,
  };
}
