import { formatOrderStatus, isAbandonedUnpaidOrder, type CustomerOrder } from "./order-contract.ts";

/** My Orders tabs, as in the app (customerOrdersPresentation.ts). */
export type OrderTab = "ALL" | "UPCOMING" | "COMPLETED" | "CANCELLED";
export const ORDER_TABS: readonly { key: OrderTab; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

const UPCOMING = new Set(["PAYMENT_PENDING", "PAID", "CHEF_ACCEPTANCE_PENDING", "CHEF_ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"]);

/**
 * Delivered is the only Completed state; declines, cancellations and refunds are Cancelled. An unpaid
 * checkout nobody finished never reached the kitchen, so it is Cancelled too rather than Upcoming.
 */
export function orderTab(order: Pick<CustomerOrder, "status" | "createdAt">, now: number): Exclude<OrderTab, "ALL"> {
  if (order.status === "DELIVERED") return "COMPLETED";
  return UPCOMING.has(order.status) && !isAbandonedUnpaidOrder(order, now) ? "UPCOMING" : "CANCELLED";
}

export function ordersInTab<T extends Pick<CustomerOrder, "status" | "createdAt">>(orders: readonly T[], tab: OrderTab, now: number): T[] {
  return tab === "ALL" ? [...orders] : orders.filter((order) => orderTab(order, now) === tab);
}

export type StatusTone = "success" | "warning" | "accent" | "muted";

const STATUS_TONES: Record<string, StatusTone> = {
  PAYMENT_PENDING: "warning",
  PAID: "warning",
  CHEF_ACCEPTANCE_PENDING: "warning",
  CHEF_ACCEPTED: "accent",
  PREPARING: "accent",
  READY_FOR_PICKUP: "success",
  OUT_FOR_DELIVERY: "accent",
  DELIVERED: "success",
  CHEF_REJECTED: "accent",
  CANCELLED: "muted",
  REFUND_PENDING: "warning",
  REFUNDED: "muted",
  REFUND_FAILED: "accent",
};

/** The status pill's fill and text. */
export const TONE_PILL: Record<StatusTone, string> = {
  success: "bg-[#E8F7F1] text-[#166B49]",
  warning: "bg-[#FFF4DF] text-[#7A4A00]",
  // #C4200F rather than the app's #D92714, which is 4.3:1 on this pink: short of AA for 15 px text.
  accent: "bg-[#FDEAE8] text-[#C4200F]",
  muted: "bg-[#F7F5F3] text-[#706864]",
};

/** The same colours as plain text on white (the order page's Payment row). */
export const TONE_TEXT: Record<StatusTone, string> = {
  success: "text-[#166B49]",
  warning: "text-[#7A4A00]",
  accent: "text-[#D92714]",
  muted: "text-[#6B6B6B]",
};

/** The pill on an order card: the app's words and colours; an abandoned unpaid checkout says so. */
export function orderStatusPill(order: Pick<CustomerOrder, "status" | "createdAt">, now: number): { label: string; tone: StatusTone } {
  if (isAbandonedUnpaidOrder(order, now)) return { label: "Payment not completed", tone: "muted" };
  return { label: formatOrderStatus(order.status), tone: STATUS_TONES[order.status] ?? "muted" };
}

/** The card's second button, as in the app: track while the food is being made or carried, reorder once delivered. */
export function orderAction(status: string): "TRACK" | "REORDER" | "DETAILS" {
  if (status === "PREPARING" || status === "READY_FOR_PICKUP" || status === "OUT_FOR_DELIVERY") return "TRACK";
  return status === "DELIVERED" ? "REORDER" : "DETAILS";
}

/**
 * The order page's Payment row (the app's paymentStatusForOrder). Nothing for a declined or cancelled order:
 * its refund shows as its own status once it starts.
 */
export function paymentStatus(
  status: string,
  { abandoned = false, confirming = false }: { abandoned?: boolean; confirming?: boolean } = {},
): { label: string; tone: StatusTone } | null {
  switch (status) {
    case "PAYMENT_PENDING":
      if (abandoned) return { label: "Payment not completed", tone: "muted" };
      return confirming ? { label: "Confirming payment", tone: "warning" } : { label: "Payment pending", tone: "warning" };
    case "REFUND_PENDING":
      return { label: "Refund pending", tone: "warning" };
    case "REFUNDED":
      return { label: "Refunded", tone: "success" };
    case "REFUND_FAILED":
      return { label: "Refund issue", tone: "accent" };
    case "CHEF_REJECTED":
    case "CANCELLED":
      return null;
    default:
      return { label: "Paid", tone: "success" };
  }
}

function sameDay(left: Date, right: Date): boolean {
  return left.toDateString() === right.toDateString();
}

/** "Today, 12:42 pm", "Yesterday, 9:05 am", "10 Oct, 12:42 pm", like the app; the year only when it isn't this one. */
export function formatOrderDate(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const day = sameDay(date, now)
    ? "Today"
    : sameDay(date, yesterday)
      ? "Yesterday"
      : date.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
        });
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  return `${day}, ${time}`;
}

/** "Veg thali × 2, Roti × 4", the app's order card line. */
export function orderItemsLine(items: readonly { itemName: string; quantity: number }[]): string {
  return items.length ? items.map((item) => `${item.itemName} × ${item.quantity}`).join(", ") : "Order items unavailable";
}
