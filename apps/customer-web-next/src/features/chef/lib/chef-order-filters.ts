// The Orders tabs and the Past list, as the app sorts them (app chefOrders/domain/chefOrderFilters.ts).
import { format, messages, type Language } from "../../../shared/i18n/language.ts";
import type { ChefOrder, ChefOrderStatus } from "./chef-order-contract.ts";

export type InboxView = "NEEDS_ANSWER" | "IN_PROGRESS" | "READY" | "PREVIOUS";

// Unpaid orders have no tab: the chef is not asked about an order before it is paid.
const VIEW_OF: Partial<Record<ChefOrderStatus, InboxView>> = {
  CHEF_ACCEPTANCE_PENDING: "NEEDS_ANSWER",
  CHEF_ACCEPTED: "IN_PROGRESS",
  PREPARING: "IN_PROGRESS",
  READY_FOR_PICKUP: "READY",
  // Picked up: nothing is left for the kitchen to do, so it moves to Past.
  OUT_FOR_DELIVERY: "PREVIOUS",
  DELIVERED: "PREVIOUS",
  CHEF_REJECTED: "PREVIOUS",
  CANCELLED: "PREVIOUS",
  REFUND_PENDING: "PREVIOUS",
  REFUNDED: "PREVIOUS",
  REFUND_FAILED: "PREVIOUS",
};

export const inboxViewOf = (status: ChefOrderStatus): InboxView | null => VIEW_OF[status] ?? null;

export const PAST_KINDS = ["ALL", "DELIVERED", "ON_THE_WAY", "CANCELLED", "REJECTED"] as const;
export type PastKind = (typeof PAST_KINDS)[number];

/** The chip a finished order is listed under; a refund only follows a cancelled order. */
export function pastKindOf(status: ChefOrderStatus): Exclude<PastKind, "ALL"> {
  if (status === "DELIVERED") return "DELIVERED";
  if (status === "OUT_FOR_DELIVERY") return "ON_THE_WAY";
  return status === "CHEF_REJECTED" ? "REJECTED" : "CANCELLED";
}

/** When an order last changed, which for a finished order is when it finished. */
export const finishedAt = (order: Pick<ChefOrder, "updatedAt" | "createdAt">) => Date.parse(order.updatedAt) || Date.parse(order.createdAt) || 0;

const indiaDay = (time: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(time);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const WORDS = messages({
  en: { today: "Today", yesterday: "Yesterday", orderOne: "{count} order", orderMany: "{count} orders" },
  te: { today: "ఈరోజు", yesterday: "నిన్న", orderOne: "{count} ఆర్డర్", orderMany: "{count} ఆర్డర్లు" },
  kn: { today: "ಇಂದು", yesterday: "ನಿನ್ನೆ", orderOne: "{count} ಆರ್ಡರ್", orderMany: "{count} ಆರ್ಡರ್‌ಗಳು" },
});

export type PastGroup = {
  /** The India date, 2026-10-26. */
  key: string;
  count: number;
  /** Food sold that day (delivered or on the way); rejected and cancelled orders add nothing. */
  total: number;
  currency: string;
  orders: ChefOrder[];
};

/** Past orders by the India day they finished, newest day and newest order first. */
export function groupPastOrders(orders: readonly ChefOrder[]): PastGroup[] {
  const groups = new Map<string, PastGroup>();
  for (const order of [...orders].sort((a, b) => finishedAt(b) - finishedAt(a))) {
    const key = indiaDay(finishedAt(order));
    const group = groups.get(key) ?? { key, count: 0, total: 0, currency: order.currency, orders: [] };
    group.orders.push(order);
    group.count += 1;
    if (order.status === "DELIVERED" || order.status === "OUT_FOR_DELIVERY") group.total = Math.round((group.total + order.foodSubtotal) * 100) / 100;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** "Today · 5 orders · ₹1,240"; the money is left out when nothing was sold. Dates keep the English month, as elsewhere. */
export function pastGroupLabel(group: PastGroup, now: Date, language: Language = "en"): string {
  const words = WORDS[language];
  const [, month, day] = group.key.split("-").map(Number);
  const title =
    group.key === indiaDay(now.getTime()) ? words.today
      : group.key === indiaDay(now.getTime() - 86_400_000) ? words.yesterday
        : `${day} ${MONTHS[(month ?? 1) - 1]}`;
  const money = group.total > 0 ? new Intl.NumberFormat("en-IN", { style: "currency", currency: group.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(group.total) : null;
  return [title, format(group.count === 1 ? words.orderOne : words.orderMany, { count: group.count }), money].filter(Boolean).join(" · ");
}
