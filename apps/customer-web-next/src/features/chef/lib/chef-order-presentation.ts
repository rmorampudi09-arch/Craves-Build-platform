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

/** "Ready in 8 min" from when the chef accepted (the order's last update, as the app), then "5 min late". */
export function prepCountdown(order: Pick<ChefOrder, "status" | "prepTimeMinutes" | "updatedAt">, now: number): Countdown | null {
  if ((order.status !== "CHEF_ACCEPTED" && order.status !== "PREPARING") || !order.prepTimeMinutes) return null;
  const started = Date.parse(order.updatedAt);
  if (Number.isNaN(started)) return null;
  const due = started + order.prepTimeMinutes * 60_000;
  return now > due
    ? { label: `${Math.max(1, Math.round((now - due) / 60_000))} min late`, tone: "danger", fill: 1 }
    : { label: `Ready in ${Math.max(1, Math.ceil((due - now) / 60_000))} min`, tone: "success", fill: Math.max(0, now - started) / (due - started) };
}

export const DEFAULT_PREP_MINUTES = 15;

/** Minutes the one-tap Accept promises: the time the order already holds, else its slowest dish, else 15 (as the app). */
export function acceptReadyMinutes(
  order: Pick<ChefOrder, "prepTimeMinutes" | "items">,
  dishes: readonly { id: string; itemName: string; preparationTimeMinutes: number | null }[],
): number {
  if (order.prepTimeMinutes != null) return order.prepTimeMinutes;
  const byId = new Map(dishes.map((dish) => [dish.id, dish.preparationTimeMinutes]));
  const byName = new Map(dishes.map((dish) => [dish.itemName.trim().toLowerCase(), dish.preparationTimeMinutes]));
  const minutes = order.items.map((item) => byId.get(item.menuItemId) ?? byName.get(item.itemName.trim().toLowerCase()) ?? DEFAULT_PREP_MINUTES);
  // The accept route takes 1 to 1,440 minutes.
  return Math.min(1_440, minutes.length ? Math.max(...minutes) : DEFAULT_PREP_MINUTES);
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
