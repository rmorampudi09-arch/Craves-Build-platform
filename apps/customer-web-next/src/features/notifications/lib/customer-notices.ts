import { isKitchenNotice, type CustomerNotification } from "./notification-contract.ts";

export type NoticeCategory = "ALL" | "ORDERS" | "OFFERS" | "UPDATES" | "OTHER";

/** The app's notification chips (customerNotificationsModel.ts). */
export const NOTICE_CATEGORIES: readonly { id: NoticeCategory; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "ORDERS", label: "Orders" },
  { id: "OFFERS", label: "Offers" },
  { id: "UPDATES", label: "Updates" },
  { id: "OTHER", label: "Other" },
];

/** The app's buckets, from the notice's target first, then words in its type. */
export function noticeCategory(notice: Pick<CustomerNotification, "noticeType" | "targetType">): Exclude<NoticeCategory, "ALL"> {
  const target = (notice.targetType ?? "").trim().toUpperCase();
  const type = notice.noticeType.trim().toUpperCase();
  if (target === "ORDER" || target === "DELIVERY") return "ORDERS";
  if (target === "OFFER" || target === "COUPON" || /OFFER|COUPON|PROMO|DISCOUNT/.test(type)) return "OFFERS";
  if (["KITCHEN", "REWARD", "ACCOUNT", "SYSTEM"].includes(target) || /KITCHEN|REWARD|ACCOUNT|SYSTEM/.test(type)) return "UPDATES";
  return "OTHER";
}

export function categoryCounts(notices: readonly Pick<CustomerNotification, "noticeType" | "targetType">[]): Record<NoticeCategory, number> {
  const counts: Record<NoticeCategory, number> = { ALL: notices.length, ORDERS: 0, OFFERS: 0, UPDATES: 0, OTHER: 0 };
  for (const notice of notices) counts[noticeCategory(notice)] += 1;
  return counts;
}

/**
 * Where a tap leads, from the server's target only: the customer's own order, its live delivery, or a kitchen
 * ("Home chefs now cook near …"). A kitchen's own order belongs to Chef Mode, so it leads nowhere here.
 */
export function noticeHref(notice: CustomerNotification): string | null {
  if (!notice.targetId) return null;
  const target = (notice.targetType ?? "").trim().toUpperCase();
  if (target === "KITCHEN") return `/kitchen/${notice.targetId}`;
  if (isKitchenNotice(notice)) return null;
  if (target === "ORDER") return `/orders/${notice.targetId}`;
  if (target === "DELIVERY") return `/orders/${notice.targetId}/tracking`;
  return null;
}
