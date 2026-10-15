import { shortOrderNumber } from "../../../shared/lib/order-number.ts";
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

export const NOT_PICKED_UP_REASONS = [
  "Partner hasn’t arrived yet",
  "Partner left without the order",
  "Partner asked me to cancel",
  "Something else",
] as const;

/** The support ticket for an order the courier has not collected, with the order attached (as the app). */
export function notPickedUpCase(orderId: string, reason: string, note: string) {
  const details = note.trim();
  return {
    contextRole: "CHEF" as const,
    orderId,
    subject: `Not picked up · #${shortOrderNumber(orderId)}`,
    message: details ? `${reason}\n\n${details}` : reason,
  };
}

/** "Arriving in 6 min", "Should be here now", or null without a pickup time. */
export function pickupEtaLabel(pickupEtaAt: string | null, now: number): string | null {
  const eta = pickupEtaAt ? Date.parse(pickupEtaAt) : NaN;
  if (Number.isNaN(eta)) return null;
  const minutes = Math.ceil((eta - now) / 60_000);
  return minutes > 0 ? `Arriving in ${minutes} min` : "Should be here now";
}
