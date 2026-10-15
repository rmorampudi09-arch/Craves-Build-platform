import { formatOrderStatus, type CustomerOrder } from "./order-contract.ts";
import type { DeliveryStatus } from "./delivery-status.ts";

/** What the order page shows on the blurred map until the food leaves the kitchen. */
export const KITCHEN_STEPS = ["Awaiting chef", "Chef accepted", "Ready for pickup"] as const;

export type OrderJourney =
  /** Still in the kitchen: blurred map, KITCHEN_STEPS[step] is current (-1 = not paid yet). */
  | { kind: "KITCHEN"; step: -1 | 0 | 1 | 2; title: string; detail: string }
  /** Picked up or delivered: the map is live. */
  | { kind: "DELIVERY"; delivered: boolean; title: string; detail: string }
  /** Declined, cancelled or refunded: no map. */
  | { kind: "CLOSED"; title: string; detail: string };

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

function readyIn(minutes: number | null): string {
  return minutes ? ` Ready in about ${minutes} min.` : "";
}

/** Where the order is and what to tell the customer, in the app's words. */
export function orderJourney(
  order: Pick<CustomerOrder, "status" | "prepTimeMinutes">,
  delivery: DeliveryStatus | null,
): OrderJourney {
  switch (order.status) {
    case "PAYMENT_PENDING":
      return { kind: "KITCHEN", step: -1, title: "Payment pending", detail: "Finish the payment to send this order to the chef." };
    case "PAID":
    case "CHEF_ACCEPTANCE_PENDING":
      return { kind: "KITCHEN", step: 0, title: "Waiting for the chef", detail: "The chef will confirm your order shortly." };
    case "CHEF_ACCEPTED":
      return { kind: "KITCHEN", step: 1, title: "Chef accepted", detail: `Your order is confirmed and cooked fresh.${readyIn(order.prepTimeMinutes)}` };
    case "PREPARING":
      return { kind: "KITCHEN", step: 1, title: "Preparing your food", detail: `The chef is cooking now.${readyIn(order.prepTimeMinutes)}` };
    case "READY_FOR_PICKUP":
      // The delivery update can land before the order status catches up.
      return hasLeftKitchen(delivery)
        ? onTheWay(delivery)
        : { kind: "KITCHEN", step: 2, title: "Ready for pickup", detail: "Packed and waiting for the delivery partner." };
    case "OUT_FOR_DELIVERY":
      return onTheWay(delivery);
    case "DELIVERED":
      return { kind: "DELIVERY", delivered: true, title: "Delivered", detail: "Your order has been delivered. Enjoy your meal!" };
    case "CHEF_REJECTED":
      return { kind: "CLOSED", title: "Chef declined", detail: "The chef could not take this order." };
    case "CANCELLED":
      return { kind: "CLOSED", title: "Order cancelled", detail: "This order will not be delivered." };
    case "REFUND_PENDING":
      return { kind: "CLOSED", title: "Refund in progress", detail: "Your refund is being processed." };
    case "REFUNDED":
      return { kind: "CLOSED", title: "Refunded", detail: "Your payment has been refunded." };
    case "REFUND_FAILED":
      return { kind: "CLOSED", title: "Refund needs attention", detail: "Get help below and we will sort it out." };
    default:
      return { kind: "CLOSED", title: formatOrderStatus(order.status), detail: "" };
  }
}

function onTheWay(delivery: DeliveryStatus | null): OrderJourney {
  if (delivery === "IN_TRANSIT") {
    return { kind: "DELIVERY", delivered: false, title: "On the way", detail: "Your order is in transit." };
  }
  if (delivery === "AT_DROPOFF") {
    return { kind: "DELIVERY", delivered: false, title: "Arriving at your location", detail: "The delivery partner has reached the drop-off area." };
  }
  return { kind: "DELIVERY", delivered: false, title: "On the way", detail: "Your order has been picked up and is coming to you." };
}

/** The delivery address pin, when the order's address snapshot carries one. */
export function homePin(order: Pick<CustomerOrder, "deliveryAddress"> | null): MapPoint | null {
  const address = order?.deliveryAddress;
  return address?.latitude !== undefined && address.longitude !== undefined
    ? { latitude: address.latitude, longitude: address.longitude }
    : null;
}
