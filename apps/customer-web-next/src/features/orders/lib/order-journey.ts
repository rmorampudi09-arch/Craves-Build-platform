import type { CustomerOrder } from "./order-contract.ts";
import type { DeliveryStatus } from "./delivery-status.ts";

/** What the order page shows on the blurred map until the food leaves the kitchen. */
export const KITCHEN_STEPS = ["Awaiting chef", "Chef accepted", "Ready for pickup"] as const;

export type OrderJourney =
  /** Still in the kitchen: blurred map, KITCHEN_STEPS[step] is current (-1 = not paid yet). */
  | { kind: "KITCHEN"; step: -1 | 0 | 1 | 2 }
  /** Picked up or delivered: the map is live. */
  | { kind: "DELIVERY"; delivered: boolean }
  /** Declined, cancelled or refunded: no map. */
  | { kind: "CLOSED" };

export type MapPoint = { latitude: number; longitude: number };

const AFTER_PICKUP = new Set<DeliveryStatus>([
  "PICKED_UP",
  "IN_TRANSIT",
  "AT_DROPOFF",
  "DELIVERED",
]);

/** True once the delivery partner has the food. */
export function hasLeftKitchen(delivery: DeliveryStatus | null): boolean {
  return delivery !== null && AFTER_PICKUP.has(delivery);
}

/** The order statuses whose delivery is worth asking about; ready for pickup too, as pickup can be reported first. */
export function tracksDelivery(status: string): boolean {
  return status === "READY_FOR_PICKUP" || status === "OUT_FOR_DELIVERY";
}

export function orderJourney(status: string, delivery: DeliveryStatus | null): OrderJourney {
  switch (status) {
    case "PAYMENT_PENDING":
      return { kind: "KITCHEN", step: -1 };
    case "PAID":
    case "CHEF_ACCEPTANCE_PENDING":
      return { kind: "KITCHEN", step: 0 };
    case "CHEF_ACCEPTED":
    case "PREPARING":
      return { kind: "KITCHEN", step: 1 };
    case "READY_FOR_PICKUP":
      // The delivery update can land before the order status catches up.
      return hasLeftKitchen(delivery)
        ? { kind: "DELIVERY", delivered: false }
        : { kind: "KITCHEN", step: 2 };
    case "OUT_FOR_DELIVERY":
      return { kind: "DELIVERY", delivered: false };
    case "DELIVERED":
      return { kind: "DELIVERY", delivered: true };
    default:
      return { kind: "CLOSED" };
  }
}

/** The delivery address pin, when the order's address snapshot carries one. */
export function homePin(order: Pick<CustomerOrder, "deliveryAddress"> | null): MapPoint | null {
  const address = order?.deliveryAddress;
  return address?.latitude !== undefined && address.longitude !== undefined
    ? { latitude: address.latitude, longitude: address.longitude }
    : null;
}
