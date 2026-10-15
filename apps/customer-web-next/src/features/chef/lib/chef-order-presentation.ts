import type { ChefOrder } from "./chef-order-contract.ts";

export type CountdownTone = "danger" | "warning" | "success";
export type Countdown = { label: string; tone: CountdownTone; fill: number | null };

/** "Respond in 4:32" with a bar that empties towards the deadline: red under 5 minutes, amber under 10 (as the app). */
export function respondCountdown(
  order: Pick<ChefOrder, "createdAt"> & { chefAcceptanceExpiresAt: string },
  now: number,
): Countdown {
  const deadline = Date.parse(order.chefAcceptanceExpiresAt);
  const remaining = Math.max(0, deadline - now);
  if (remaining === 0) return { label: "Time to respond has passed", tone: "danger", fill: null };
  const total = deadline - Date.parse(order.createdAt);
  const seconds = Math.floor(remaining / 1000);
  return {
    label: `Respond in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
    tone: remaining < 5 * 60_000 ? "danger" : remaining < 10 * 60_000 ? "warning" : "success",
    fill: total > 0 ? Math.min(1, remaining / total) : null,
  };
}

/** What declining means for the customer: a paid order has a checkout; a meal-plan day has none, so nothing is refunded. */
export function declineConsequence(order: Pick<ChefOrder, "checkoutId">): string {
  return order.checkoutId
    ? "The customer is told right away and gets a full refund."
    : "The customer is told right away. This meal-plan day moves to the end of their plan.";
}
