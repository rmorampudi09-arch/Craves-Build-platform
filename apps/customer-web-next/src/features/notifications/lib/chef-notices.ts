import type { CustomerNotification } from "./notification-contract.ts";
import { formatRelativeTime } from "../../../shared/lib/relative-time.ts";

export type ChefNoticeCategory = "orders" | "money" | "reviews" | "plans" | "other";
export type ChefNoticeFilter = "all" | "orders" | "money" | "reviews";
export const CHEF_NOTICE_FILTERS: readonly { id: ChefNoticeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "orders", label: "Orders" },
  { id: "money", label: "Money" },
  { id: "reviews", label: "Reviews" },
];

/** Same buckets as the app, from the notice's type and target. */
export function chefNoticeCategory(notice: CustomerNotification): ChefNoticeCategory {
  const kind = `${notice.noticeType} ${notice.targetType ?? ""}`.toUpperCase();
  if (/REVIEW/.test(kind)) return "reviews";
  if (/PAYOUT|WITHDRAW|EARNING|SETTLEMENT|PAYMENT/.test(kind)) return "money";
  if (/SUBSCRIPTION|MEAL_PLAN|PLAN/.test(kind)) return "plans";
  if (/ORDER/.test(kind)) return "orders";
  return "other";
}

/** Where a tap leads: the order, Payout history, Meal plans, or the chef application. Reviews have no chef page on the web yet. */
export function chefNoticeHref(notice: CustomerNotification): string | null {
  const category = chefNoticeCategory(notice);
  if (category === "orders") return notice.targetId ? `/chef/orders/${notice.targetId}` : null;
  if (category === "money") return "/chef/earnings/payouts";
  if (category === "plans") return "/chef/meal-plans";
  return (notice.targetType ?? "").toUpperCase() === "CHEF_APPLICATION"
    ? "/chef/application/status"
    : null;
}

export const isToday = (iso: string, now: Date) =>
  new Date(iso).toDateString() === now.toDateString();

/** `12 min ago` for the last hour, `1:30 PM` for earlier today, then `Yesterday` or `2 Oct`, like the app. */
export function chefNoticeTime(createdAt: string, now: Date): string {
  const created = new Date(createdAt);
  if (isToday(createdAt, now) && now.getTime() - created.getTime() >= 3_600_000) {
    const hours = created.getHours();
    return `${hours % 12 || 12}:${String(created.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  }
  return formatRelativeTime(createdAt, now);
}

/**
 * Marks each notice read, six at a time. Never read-all here: that would also mark the account's customer
 * notices. Resolves with the ids now read, in the given order; rejects only when none could be marked.
 */
export async function markEachRead(
  ids: readonly string[],
  mark: (id: string) => Promise<void>,
): Promise<string[]> {
  const marked = new Set<string>();
  let failed = false;
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        await mark(id);
        marked.add(id);
      } catch {
        failed = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, ids.length) }, worker));
  if (failed && marked.size === 0) throw new Error("MARK_READ_FAILED");
  return ids.filter((id) => marked.has(id));
}
