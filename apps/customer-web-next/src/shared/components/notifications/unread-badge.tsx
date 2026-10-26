"use client";

import { useEffect, useState } from "react";
import { NOTICES_READ_EVENT } from "@/shared/lib/notice-events";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { cn } from "@/shared/lib/utils";

/** "3", "9+" at most, like the app's bell; null (no badge) when nothing is unread or the count is unknown. */
export function unreadBadgeLabel(count: number | null): string | null {
  return count && count > 0 ? (count > 9 ? "9+" : String(count)) : null;
}

/** The bell's accessible name: "Notifications, 3 unread". */
export function notificationsLabel(count: number | null): string {
  const label = unreadBadgeLabel(count);
  return label ? `Notifications, ${label} unread` : "Notifications";
}

/**
 * The signed-in customer's unread notices (the same inbox /notifications lists). Read on mount, when the tab or
 * window comes back, and after notices are read here; no polling. null until known, or when the read fails.
 * Pass `enabled: false` for guests, who have no inbox.
 */
export function useCustomerUnreadCount(enabled = true): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let reading = false;
    const read = () => {
      if (reading || document.visibilityState === "hidden") return;
      reading = true;
      void sessionFetch("/api/notifications/in-app/unread-count", { cache: "no-store" })
        .then(async (response) => {
          const body: unknown = response.ok ? await response.json().catch(() => null) : null;
          const unread = body && typeof body === "object" ? (body as { unreadCount?: unknown }).unreadCount : null;
          if (live) setCount(typeof unread === "number" && Number.isSafeInteger(unread) && unread >= 0 ? unread : null);
        })
        .catch(() => undefined)
        .finally(() => {
          reading = false;
        });
    };
    read();
    document.addEventListener("visibilitychange", read);
    window.addEventListener("focus", read);
    window.addEventListener(NOTICES_READ_EVENT, read);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", read);
      window.removeEventListener("focus", read);
      window.removeEventListener(NOTICES_READ_EVENT, read);
    };
  }, [enabled]);
  return enabled ? count : null;
}

/**
 * The red count on a bell, like the app's (20 px, white ring, "9+"). Put it inside the bell's link or button,
 * which needs `relative` and the name from `notificationsLabel(count)`; the badge itself is hidden from screen readers.
 */
export function UnreadBadge({ count, className }: { count: number | null; className?: string }) {
  const label = unreadBadgeLabel(count);
  if (!label) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-[#D92714] px-1 text-[0.6875rem] font-bold leading-none text-white",
        className,
      )}
    >
      {label}
    </span>
  );
}
