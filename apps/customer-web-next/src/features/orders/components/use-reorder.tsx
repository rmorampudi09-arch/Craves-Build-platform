"use client";

import { useState } from "react";
import { orderLikeLastTime } from "@/features/orders/api/repeat-orders";
import type { CustomerOrder } from "@/features/orders/lib/order-contract";
import { Dialog, secondaryActionClass } from "@/shared/ui/overlays/overlay";

export type Reorder = { orderId: string; busy: boolean; message: string } | null;

/**
 * Reorder, as in the app: Craves rebuilds the cart from a delivered order in one step once every dish is checked,
 * and a cart that holds dishes is replaced only after the customer agrees. `openCart` runs when the cart is ready;
 * a refusal leaves Craves' reason in `reorder.message`. The page renders `dialog` once.
 */
export function useReorder(openCart: () => void) {
  const [reorder, setReorder] = useState<Reorder>(null);
  // Set while "Replace current cart?" waits for an answer.
  const [answer, setAnswer] = useState<((replace: boolean) => void) | null>(null);

  async function start(order: CustomerOrder) {
    if (reorder?.busy) return;
    setReorder({ orderId: order.id, busy: true, message: "" });
    const outcome = await orderLikeLastTime(
      { orderId: order.id, kitchenId: order.kitchenId, items: order.items },
      () => new Promise<boolean>((resolve) => setAnswer(() => resolve)),
    );
    if (outcome?.added) openCart();
    // null: "Keep cart" was the customer's choice, nothing to report.
    else setReorder(outcome ? { orderId: order.id, busy: false, message: outcome.message } : null);
  }

  function reply(replace: boolean) {
    answer?.(replace);
    setAnswer(null);
  }

  const dialog = (
    <Dialog
      open={answer !== null}
      onOpenChange={(open) => {
        if (!open) reply(false);
      }}
      title="Replace current cart?"
      description="Reorder will replace your current cart after Craves verifies every dish is still available."
      footer={
        <>
          <button type="button" onClick={() => reply(false)} className={secondaryActionClass}>
            Keep cart
          </button>
          <button type="button" onClick={() => reply(true)} className="craves-primary-action w-full sm:w-auto">
            Replace &amp; reorder
          </button>
        </>
      }
    />
  );

  return { reorder, start, dialog };
}
