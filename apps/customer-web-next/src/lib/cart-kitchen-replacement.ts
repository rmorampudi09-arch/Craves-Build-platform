"use client";

export const CART_KITCHEN_REPLACEMENT_EVENT = "craves:cart-kitchen-replacement";

export type CartKitchenReplacementRequest = {
  currentKitchen: string;
  targetKitchen: string;
  handled: boolean;
  respond: (confirmed: boolean) => void;
};

export function requestCartKitchenReplacement(
  currentKitchen: string,
  targetKitchen: string,
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const respond = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      resolve(confirmed);
    };

    const detail: CartKitchenReplacementRequest = {
      currentKitchen,
      targetKitchen,
      handled: false,
      respond,
    };

    window.dispatchEvent(
      new CustomEvent<CartKitchenReplacementRequest>(
        CART_KITCHEN_REPLACEMENT_EVENT,
        { detail },
      ),
    );

    if (!detail.handled) {
      respond(
        window.confirm(
          `Your cart contains items from ${currentKitchen}. Replace them with items from ${targetKitchen}?`,
        ),
      );
    }
  });
}
