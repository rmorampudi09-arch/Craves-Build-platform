"use client";

import { loadCart } from "@/features/cart/api/cravesCart";
import { loadKitchenMenu } from "@/features/dish/api/dishes";
import {
  parseCartForReorder,
  parseRepeatOrderPage,
  REPEAT_ORDER_PAGE_SIZE,
  type RepeatOrderCandidate,
} from "@/features/orders/lib/repeat-order-contract";
import { isFeatureUnavailable } from "@/shared/lib/feature-availability";
import { sessionFetch } from "@/shared/lib/session-fetch";

/** The customer's previous baskets, newest first; none while this backend has no repeat orders. Throws when they didn't load. */
export async function listRepeatOrders(): Promise<RepeatOrderCandidate[]> {
  const response = await sessionFetch(
    `/api/orders/repeat-candidates?limit=${REPEAT_ORDER_PAGE_SIZE}`,
    { cache: "no-store" },
  );
  const body: unknown = await response.json().catch(() => null);
  if (isFeatureUnavailable(response.status, body)) return [];
  const page = response.ok ? parseRepeatOrderPage(body) : null;
  if (!page) throw new Error(`REPEAT_ORDERS_FAILED_${response.status}`);
  return page.items;
}

/** Where the customer can sort out a basket that could not be rebuilt. */
export type ReorderRecovery = "cart" | "menu" | null;
export type ReorderOutcome =
  { added: true } | { added: false; message: string; recovery: ReorderRecovery };

const blocked = (message: string, recovery: ReorderRecovery): ReorderOutcome => ({
  added: false,
  message,
  recovery,
});
const UNCONFIRMED = blocked(
  "The reorder result could not be confirmed. Check your cart before trying any previous basket again.",
  "cart",
);

/**
 * "Order like last time": checks every dish is still on the kitchen's menu, then fills the empty cart with the
 * basket through the conditional reorder, which Craves refuses if the cart changed meanwhile. A cart that already
 * holds dishes is never replaced from here: the cart page owns that choice.
 */
export async function orderLikeLastTime(candidate: RepeatOrderCandidate): Promise<ReorderOutcome> {
  let onMenu: Set<string>;
  try {
    onMenu = new Set(
      (await loadKitchenMenu(candidate.kitchenId, { remember: false })).map((dish) => dish.id),
    );
  } catch {
    return blocked("Today’s menu didn’t load. Check your connection and try again.", null);
  }
  if (candidate.items.some((item) => !onMenu.has(item.menuItemId))) {
    return blocked(
      "One or more previous dishes are not currently available. Review today's kitchen menu.",
      "menu",
    );
  }

  const current = await sessionFetch("/api/cart", { cache: "no-store" }).catch(() => null);
  const cart = current?.ok ? parseCartForReorder(await current.json().catch(() => null)) : null;
  if (!cart)
    return blocked(
      "Craves could not verify your current cart. Refresh it before trying again.",
      "cart",
    );
  if (cart.kitchenName) {
    return blocked(
      `Your cart already has dishes from ${cart.kitchenName}. Check out or empty your cart first, then order like last time.`,
      "cart",
    );
  }

  const response = await sessionFetch(
    `/api/cart/reorder-if-unchanged/${encodeURIComponent(candidate.orderId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedCart: { cartId: cart.cartId, items: [] },
        expectedKitchenId: candidate.kitchenId,
      }),
    },
  ).catch(() => null);
  if (!response?.ok) {
    const code = ((await response?.json().catch(() => null)) as { code?: unknown } | null)?.code;
    if (code === "CART_CHANGED" || code === "CART_KITCHEN_CONFLICT") {
      return blocked(
        "Your cart changed while we were checking it. Review your cart, then try again.",
        "cart",
      );
    }
    // A refused rebuild left the cart as it was; anything else (timeouts, order-service's empty 403) may not have.
    return response && [400, 404, 409, 422].includes(response.status)
      ? blocked(
          "That previous basket cannot be rebuilt exactly right now. Review today's menu from this kitchen.",
          "menu",
        )
      : UNCONFIRMED;
  }
  // The tab bar and the cart page show the refilled cart at once.
  await loadCart().catch(() => undefined);
  return { added: true };
}
