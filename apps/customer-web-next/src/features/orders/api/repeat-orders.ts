"use client";

import { loadCart } from "@/features/cart/api/cravesCart";
import { loadKitchenMenu } from "@/features/dish/api/dishes";
import {
  parseCartForReorder,
  parseRepeatOrderPage,
  REPEAT_ORDER_PAGE_SIZE,
  type RepeatOrderCandidate,
  type RepeatOrderPage,
} from "@/features/orders/lib/repeat-order-contract";
import { isFeatureUnavailable } from "@/shared/lib/feature-availability";
import { sessionFetch } from "@/shared/lib/session-fetch";

const NO_PAGE: RepeatOrderPage = { items: [], nextCursor: null, hasMore: false };

/**
 * One page of the customer's previous baskets; none once signed out or while this backend has no repeat orders.
 * Throws when they didn't load.
 */
export async function listRepeatOrders(cursor?: string): Promise<RepeatOrderPage> {
  const query = new URLSearchParams({ limit: String(REPEAT_ORDER_PAGE_SIZE) });
  if (cursor) query.set("cursor", cursor);
  const response = await sessionFetch(`/api/orders/repeat-candidates?${query}`, {
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 401 || isFeatureUnavailable(response.status, body)) return NO_PAGE;
  const page = response.ok ? parseRepeatOrderPage(body) : null;
  if (!page) throw new Error(`REPEAT_ORDERS_FAILED_${response.status}`);
  return page;
}

/** Where the customer can sort out a basket that could not be rebuilt: the cart once the result is uncertain, else the kitchen's menu. */
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

async function readCart() {
  const response = await sessionFetch("/api/cart", { cache: "no-store" }).catch(() => null);
  return response?.ok ? parseCartForReorder(await response.json().catch(() => null)) : null;
}

/**
 * "Order like last time": checks every dish is still on the kitchen's menu, then rebuilds the cart from the basket
 * through the conditional reorder, which Craves refuses if the cart changed since it was read. A cart that holds
 * dishes is replaced only once `confirmReplace` agrees; null when the customer keeps it.
 */
export async function orderLikeLastTime(
  candidate: Pick<RepeatOrderCandidate, "orderId" | "kitchenId"> & { items: readonly { menuItemId: string }[] },
  confirmReplace: () => Promise<boolean>,
): Promise<ReorderOutcome | null> {
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

  const cart = await readCart();
  if (!cart)
    return blocked(
      "Craves could not verify your current cart. Refresh it before trying again.",
      "menu",
    );
  if (cart.items.length && !(await confirmReplace())) return null;

  const response = await sessionFetch(
    `/api/cart/reorder-if-unchanged/${encodeURIComponent(candidate.orderId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedCart: cart, expectedKitchenId: candidate.kitchenId }),
    },
  ).catch(() => null);
  if (!response?.ok) {
    const body = (await response?.json().catch(() => null)) as {
      code?: unknown;
      message?: unknown;
    } | null;
    if (body?.code === "CART_CHANGED") {
      return blocked(
        "Your cart changed while you were reviewing it. Start again to review the latest cart.",
        "menu",
      );
    }
    // A refused rebuild left the cart as it was; anything else (timeouts, order-service's empty 403) may not have.
    return response && [400, 404, 409, 422].includes(response.status)
      ? blocked(
          typeof body?.message === "string"
            ? body.message
            : "That information changed. Refresh and try again.",
          "menu",
        )
      : UNCONFIRMED;
  }
  // The tab bar and the cart page show the refilled cart at once.
  await loadCart().catch(() => undefined);
  return { added: true };
}
