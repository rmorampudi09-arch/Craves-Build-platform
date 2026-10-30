// The live order as a day sheet of the Kitchen Calendar look, the live order the owner kept (29-30 Oct 2026). Each step
// sits beside the time it happened, a red line marks now, and what is still to come follows, the delivery last.
// Only real times are shown: when the order was placed, its latest status change and the delivery partner's updates.
// There is no arrival time to invent, so nothing is promised.
import type { CustomerOrder } from "./order-contract.ts";
import type { DeliveryStatusResponse } from "./delivery-status.ts";

export type CalendarStep = "placed" | "accepted" | "cooking" | "packed" | "onTheWay" | "delivered";

export type CalendarRow = {
  step: CalendarStep;
  label: string;
  detail: string;
  /** When it happened (ISO), if Craves knows. */
  at: string | null;
  state: "done" | "now" | "next";
};

/** The rows, and the row the red now-line follows (null once delivered). */
export type OrderCalendar = { rows: CalendarRow[]; nowAfter: number | null };

const STEPS: CalendarStep[] = ["placed", "accepted", "cooking", "packed", "onTheWay", "delivered"];
const AFTER_PICKUP = new Set(["PICKED_UP", "IN_TRANSIT", "AT_DROPOFF", "DELIVERED"]);

/** "Lakshmi" from "Lakshmi's Kitchen"; otherwise "The chef". */
export function cookName(kitchenName: string): string {
  return /^(.+?)['’]s\b/.exec(kitchenName)?.[1] ?? "The chef";
}

/** The day sheet for an order still on its way to the customer; null for one that's closed or not paid yet. */
export function orderCalendar(
  order: Pick<CustomerOrder, "status" | "createdAt" | "updatedAt" | "prepTimeMinutes" | "kitchenName">,
  delivery: Pick<DeliveryStatusResponse, "status" | "history"> | null,
): OrderCalendar | null {
  const cook = cookName(order.kitchenName);
  const firstSeen = (statuses: string[]) => delivery?.history.find((entry) => statuses.includes(entry.newStatus))?.observedAt ?? null;
  const pickedUpAt = firstSeen(["PICKED_UP", "IN_TRANSIT"]);
  const deliveredAt = firstSeen(["DELIVERED"]);
  const leftKitchen = delivery?.status != null && AFTER_PICKUP.has(delivery.status);

  // The step happening now, and when it began.
  let current: number;
  let since = order.updatedAt;
  switch (order.status) {
    case "PAID":
    case "CHEF_ACCEPTANCE_PENDING":
      current = 1;
      break;
    case "CHEF_ACCEPTED":
      current = 1;
      break;
    case "PREPARING":
      current = 2;
      break;
    case "READY_FOR_PICKUP":
    case "OUT_FOR_DELIVERY":
      current = order.status === "OUT_FOR_DELIVERY" || leftKitchen ? 4 : 3;
      if (current === 4) since = pickedUpAt ?? order.updatedAt;
      break;
    case "DELIVERED":
      current = 5;
      since = deliveredAt ?? order.updatedAt;
      break;
    default:
      return null;
  }
  const waiting = order.status === "PAID" || order.status === "CHEF_ACCEPTANCE_PENDING";
  const readyIn = order.prepTimeMinutes ? `Ready in about ${order.prepTimeMinutes} min` : "still to come";

  const rows = STEPS.map((step, index): CalendarRow => {
    const state: CalendarRow["state"] =
      index < current || (index === current && step === "delivered") ? "done" : index === current ? "now" : "next";
    const at = index === 0 ? order.createdAt : index === current ? since : step === "onTheWay" && index < current ? pickedUpAt : null;
    switch (step) {
      case "placed":
        return { step, state, at, label: "Order placed", detail: "Paid and sent to the kitchen" };
      case "accepted":
        return waiting
          ? { step, state, at, label: `Waiting for ${cook === "The chef" ? "the chef" : cook}`, detail: "The chef will confirm your order shortly." }
          : { step, state, at, label: `${cook} accepted`, detail: state === "now" ? "Your order is confirmed and cooked fresh." : "Confirmed" };
      case "cooking":
        return state === "now"
          ? { step, state, at, label: "Cooking now", detail: `${cook === "The chef" ? "The chef" : cook} is cooking` }
          : { step, state, at, label: "Cooking", detail: state === "done" ? "Cooked fresh" : "still to come" };
      case "packed":
        return {
          step,
          state,
          at,
          label: "Packed",
          detail: state === "now" ? "Waiting for the delivery partner" : state === "done" ? "Handed over" : readyIn,
        };
      case "onTheWay":
        return { step, state, at, label: "On the way", detail: state === "now" ? "Your order is in transit" : state === "done" ? "Picked up" : "still to come" };
      case "delivered":
        return { step, state, at, label: "Delivered", detail: state === "done" ? "Enjoy your meal" : "still to come" };
    }
  });
  return { rows, nowAfter: current === 5 ? null : current };
}
