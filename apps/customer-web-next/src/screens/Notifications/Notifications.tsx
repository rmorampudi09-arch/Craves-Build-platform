"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  CheckCircle2,
  Circle,
  Inbox,
  PackageCheck,
  ShoppingBag,
  Truck,
  UserRoundCheck,
} from "lucide-react";
import { CravesLogo } from "@/components/brand/CravesLogo";
import type { CustomerNotification } from "@/lib/notification-contract";
import { loadSession } from "@/services/auth/cravesAuth";

type Filter = "all" | "unread" | "read";
type GroupName = "Today" | "This week" | "Earlier";

const FILTERS: Array<{
  value: Filter;
  label: string;
  icon: typeof Bell;
}> = [
  { value: "all", label: "All", icon: Bell },
  { value: "unread", label: "Unread", icon: Circle },
  { value: "read", label: "Read", icon: CheckCircle2 },
];

const GROUP_ORDER: GroupName[] = ["Today", "This week", "Earlier"];

function iconForNotice(notice: CustomerNotification) {
  const type = notice.noticeType.toLowerCase();
  const title = notice.title.toLowerCase();

  if (/deliver|delivery/.test(type) || /deliver|delivery/.test(title)) return Truck;
  if (/order/.test(type)) return ShoppingBag;
  if (/meal|plan|subscription/.test(type)) return CalendarDays;
  if (/account|profile|chef/.test(type) || /approv|profile|chef/.test(title)) {
    return UserRoundCheck;
  }
  if (/payment/.test(type)) return CheckCircle2;
  if (/system|update|feature/.test(type)) return Bell;

  return PackageCheck;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function groupForDate(createdAt: string, now: Date): GroupName {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "Earlier";

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (created >= today) return "Today";
  if (created >= startOfWeek(now)) return "This week";
  return "Earlier";
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notices, setNotices] = useState<CustomerNotification[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      if (!(await loadSession())) {
        navigate({ to: "/" });
        return;
      }

      const response = await fetch("/api/notifications/in-app?limit=50", {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(body?.message || "Notifications could not be loaded.");
      }

      setNotices(Array.isArray(body) ? body : []);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Notifications could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const unreadCount = useMemo(
    () => notices.filter((notice) => !notice.readAt).length,
    [notices],
  );

  const visibleNotices = useMemo(() => {
    const filtered =
      filter === "unread"
        ? notices.filter((notice) => !notice.readAt)
        : filter === "read"
          ? notices.filter((notice) => Boolean(notice.readAt))
          : notices;

    return [...filtered].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
      return bTime - aTime;
    });
  }, [filter, notices]);

  const groupedNotices = useMemo(() => {
    const now = new Date();
    const groups: Record<GroupName, CustomerNotification[]> = {
      Today: [],
      "This week": [],
      Earlier: [],
    };

    visibleNotices.forEach((notice) => {
      groups[groupForDate(notice.createdAt, now)].push(notice);
    });

    return groups;
  }, [visibleNotices]);

  const requestMarkRead = useCallback(async (noticeId: string) => {
    try {
      const response = await fetch(
        `/api/notifications/in-app/${noticeId}/read`,
        { method: "PATCH" },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Notification could not be updated.");
      }

      return { success: true as const };
    } catch (error) {
      return {
        success: false as const,
        message:
          error instanceof Error
            ? error.message
            : "Notification could not be updated.",
      };
    }
  }, []);

  const markRead = useCallback(
    async (notice: CustomerNotification) => {
      if (notice.readAt || busyId === notice.id) return;

      setBusyId(notice.id);
      setActionError(null);

      try {
        const result = await requestMarkRead(notice.id);
        if (!result.success) {
          setActionError(result.message);
          return;
        }

        const readAt = new Date().toISOString();
        setNotices((current) =>
          current.map((item) =>
            item.id === notice.id ? { ...item, readAt } : item,
          ),
        );
      } finally {
        setBusyId(null);
      }
    },
    [busyId, requestMarkRead],
  );

  async function markAllRead() {
    const unread = notices.filter((notice) => !notice.readAt);
    if (!unread.length || markingAll) return;

    setMarkingAll(true);
    setActionError(null);

    try {
      const results = await Promise.all(
        unread.map(async (notice) => ({
          id: notice.id,
          result: await requestMarkRead(notice.id),
        })),
      );
      const successfulIds = new Set(
        results
          .filter(({ result }) => result.success)
          .map(({ id }) => id),
      );
      const failed = results.find(({ result }) => !result.success);

      if (successfulIds.size) {
        const readAt = new Date().toISOString();
        setNotices((current) =>
          current.map((notice) =>
            successfulIds.has(notice.id) ? { ...notice, readAt } : notice,
          ),
        );
      }

      if (failed && !failed.result.success) {
        setActionError(failed.result.message);
      }
    } finally {
      setMarkingAll(false);
    }
  }

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate({ to: "/home" });
  }

  function renderEmptyState() {
    if (!notices.length) {
      return (
        <div className="flex min-h-[340px] flex-col items-center justify-center px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <Bell className="h-8 w-8" strokeWidth={2.4} aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-[#1A1A1A]">
            No notifications yet
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-[#6B6B6B] sm:text-base">
            Updates about your orders, deliveries and account will appear here.
          </p>
        </div>
      );
    }

    if (filter === "unread") {
      return (
        <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <CheckCircle2 className="h-8 w-8" strokeWidth={2.4} aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-[#1A1A1A]">
            You&apos;re all caught up
          </h2>
          <p className="mt-2 text-sm text-[#6B6B6B] sm:text-base">
            You have no unread notifications.
          </p>
        </div>
      );
    }

    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <Inbox className="h-8 w-8" strokeWidth={2.4} aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-[#1A1A1A]">
          No read notifications
        </h2>
        <p className="mt-2 text-sm text-[#6B6B6B] sm:text-base">
          Notifications you read will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="notifications-page min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex min-h-[96px] w-full max-w-6xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="notification-back-button flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] text-[#1A1A1A] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18] focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
          </button>

          <CravesLogo size="lg" priority />

          <div className="min-w-0">
            <p className="text-sm font-medium leading-5 text-[#1A1A1A] sm:text-base">
              Stay <span className="font-semibold text-[#F62E18]">updated</span>
            </p>
            <h1 className="mt-0.5 text-2xl font-bold leading-tight tracking-[-0.02em] text-[#1A1A1A] sm:text-3xl">
              Notifications
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-7 sm:px-6 sm:pt-9 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Notification filters"
            className="inline-flex w-fit max-w-full items-center rounded-full border border-[#E5E7EB] bg-white p-1 shadow-[0_1px_3px_rgba(17,24,39,0.04)]"
          >
            {FILTERS.map(({ value, label, icon: Icon }) => {
              const active = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-active={active}
                  onClick={() => setFilter(value)}
                  className="notification-filter-button flex min-w-[88px] items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18] focus-visible:ring-offset-1 sm:min-w-[108px] sm:px-4"
                >
                  <Icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={active ? 2.6 : 2.3}
                    fill={value === "all" && active ? "currentColor" : "none"}
                    aria-hidden="true"
                  />
                  {label}
                </button>
              );
            })}
          </div>

          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={markingAll}
              className="notification-mark-all inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-[#F62E18] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:text-base"
            >
              <CheckCircle2 className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
              {markingAll ? "Marking as read…" : "Mark all as read"}
            </button>
          ) : null}
        </div>

        {actionError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-[#F62E18]">
            {actionError}
          </p>
        ) : null}

        {loading ? (
          <div className="mt-8 space-y-7" aria-label="Loading notifications">
            {[0, 1, 2].map((item) => (
              <div key={item} className="animate-pulse">
                <div className="mb-3 h-5 w-24 rounded bg-[#F1F3F5]" />
                <div className="h-28 rounded-2xl border border-[#E5E7EB] bg-white p-5">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-[#F1F3F5]" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 w-48 rounded bg-[#F1F3F5]" />
                      <div className="h-3 w-3/4 rounded bg-[#F1F3F5]" />
                      <div className="h-3 w-40 rounded bg-[#F1F3F5]" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="mt-8 flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <Bell className="h-8 w-8" strokeWidth={2.4} aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-xl font-bold text-[#1A1A1A]">
              We couldn&apos;t load your notifications
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void loadNotifications()}
              className="notification-retry mt-5 rounded-full border border-[#E5E7EB] px-5 py-2.5 text-sm font-semibold text-[#F62E18] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18] focus-visible:ring-offset-2"
            >
              Try again
            </button>
          </div>
        ) : visibleNotices.length === 0 ? (
          renderEmptyState()
        ) : (
          <div className="mt-8 space-y-7">
            {GROUP_ORDER.map((groupName) => {
              const groupItems = groupedNotices[groupName];
              if (!groupItems.length) return null;

              const headingId = `notification-group-${groupName
                .replace(/\s+/g, "-")
                .toLowerCase()}`;

              return (
                <section key={groupName} aria-labelledby={headingId}>
                  <h2
                    id={headingId}
                    className="mb-3 text-base font-bold text-[#1A1A1A] sm:text-lg"
                  >
                    {groupName}
                  </h2>

                  <div className="space-y-3">
                    {groupItems.map((notice) => {
                      const Icon = iconForNotice(notice);
                      const unread = !notice.readAt;
                      const busy = busyId === notice.id;

                      return (
                        <article
                          key={notice.id}
                          role={unread ? "button" : undefined}
                          tabIndex={unread ? 0 : undefined}
                          aria-label={unread ? `${notice.title}. Mark as read` : undefined}
                          aria-disabled={busy || undefined}
                          onClick={
                            unread && !busy
                              ? () => void markRead(notice)
                              : undefined
                          }
                          onKeyDown={
                            unread && !busy
                              ? (event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    void markRead(notice);
                                  }
                                }
                              : undefined
                          }
                          className={`notification-card rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4 shadow-[0_1px_3px_rgba(17,24,39,0.04)] transition sm:px-5 sm:py-5 ${
                            unread
                              ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18] focus-visible:ring-offset-2"
                              : ""
                          } ${busy ? "cursor-wait opacity-70" : ""}`}
                        >
                          <div className="flex items-start gap-3 sm:gap-4">
                            <span
                              className={`mt-5 h-2.5 w-2.5 shrink-0 rounded-full ${
                                unread ? "bg-[#F62E18]" : "bg-[#9CA3AF]"
                              }`}
                              aria-hidden="true"
                            />

                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18] sm:h-14 sm:w-14">
                              <Icon className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
                            </div>

                            <div className="min-w-0 flex-1 pt-0.5">
                              <h3
                                className={`text-base leading-6 text-[#1A1A1A] sm:text-lg ${
                                  unread ? "font-bold" : "font-semibold"
                                }`}
                              >
                                {notice.title}
                              </h3>
                              <p className="mt-1 text-sm leading-6 text-[#6B6B6B] sm:text-base">
                                {notice.body}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-[#6B6B6B] sm:text-sm">
                                <time dateTime={notice.createdAt}>
                                  {formatDateTime(notice.createdAt)}
                                </time>
                                <span aria-hidden="true">•</span>
                                <span>{unread ? "Unread" : "Read"}</span>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <div className="flex items-center justify-center gap-2 pb-2 pt-2 text-sm font-medium text-[#6B6B6B]">
              <Inbox className="h-[19px] w-[19px]" strokeWidth={2.2} aria-hidden="true" />
              <span>You&apos;ve reached the end</span>
            </div>
          </div>
        )}
      </main>

      <style jsx global>{`
        .notifications-page .notification-back-button,
        .notifications-page .notification-filter-button,
        .notifications-page .notification-mark-all,
        .notifications-page .notification-retry {
          transform: none !important;
          box-shadow: none !important;
        }

        .notifications-page .notification-back-button {
          background: #ffffff !important;
          color: #1a1a1a !important;
        }

        .notifications-page .notification-back-button:hover {
          background: #f1f3f5 !important;
          color: #1a1a1a !important;
          transform: none !important;
        }

        .notifications-page .notification-filter-button {
          background: #ffffff !important;
          color: #1a1a1a !important;
        }

        .notifications-page .notification-filter-button[data-active="true"] {
          background: #fff0ee !important;
          color: #f62e18 !important;
        }

        .notifications-page .notification-filter-button:hover {
          background: #f1f3f5 !important;
          color: #1a1a1a !important;
          transform: none !important;
        }

        .notifications-page
          .notification-filter-button[data-active="true"]:hover {
          background: #fff0ee !important;
          color: #f62e18 !important;
        }

        .notifications-page .notification-mark-all,
        .notifications-page .notification-retry {
          background: transparent !important;
          color: #f62e18 !important;
        }

        .notifications-page .notification-mark-all:hover,
        .notifications-page .notification-retry:hover {
          background: #fff0ee !important;
          color: #f62e18 !important;
          transform: none !important;
        }

        .notifications-page .notification-card[role="button"]:hover {
          border-color: #d1d5db;
          box-shadow: 0 5px 16px rgba(17, 24, 39, 0.07);
        }
      `}</style>
    </div>
  );
}
