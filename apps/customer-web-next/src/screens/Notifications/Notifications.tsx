"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FaArrowLeft,
  FaBagShopping,
  FaBell,
  FaCalendarDays,
} from "react-icons/fa6";
import { GiChefToque } from "react-icons/gi";
import { CravesLogo } from "@/components/brand/CravesLogo";
import type { CustomerNotification } from "@/lib/notification-contract";
import { loadSession } from "@/services/auth/cravesAuth";

type NotificationFilter = "all" | "unread" | "read";
type NotificationGroup = "Today" | "This week" | "Earlier";

const GROUP_ORDER: NotificationGroup[] = ["Today", "This week", "Earlier"];

function notificationGroup(createdAt: string): NotificationGroup {
  const created = new Date(createdAt);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfWeek = new Date(startOfToday);
  const daysSinceMonday = (startOfToday.getDay() + 6) % 7;
  startOfWeek.setDate(startOfToday.getDate() - daysSinceMonday);

  if (created >= startOfToday) return "Today";
  if (created >= startOfWeek) return "This week";
  return "Earlier";
}

function notificationTimestamp(createdAt: string) {
  return new Date(createdAt).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NotificationTypeIcon({ notice }: { notice: CustomerNotification }) {
  const classification = `${notice.noticeType} ${notice.targetType ?? ""}`.toLowerCase();
  const Icon = classification.includes("chef") || classification.includes("kitchen")
    ? GiChefToque
    : classification.includes("order")
      ? FaBagShopping
      : classification.includes("subscription") || classification.includes("schedule")
        ? FaCalendarDays
        : FaBell;

  return <Icon className="text-lg" aria-hidden="true" />;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notices, setNotices] = useState<CustomerNotification[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const shownUnreadIds = useRef<Set<string>>(new Set());

  const markShownUnreadAsRead = useCallback(() => {
    const ids = Array.from(shownUnreadIds.current);
    if (!ids.length) return;

    shownUnreadIds.current.clear();
    ids.forEach((noticeId) => {
      void fetch(`/api/notifications/in-app/${noticeId}/read`, {
        method: "PATCH",
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!(await loadSession())) {
        if (active) navigate({ to: "/" });
        return;
      }

      const response = await fetch("/api/notifications/in-app?limit=50", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Notifications could not be loaded.");
      }
      if (!active) return;

      const loadedNotices = body as CustomerNotification[];
      setNotices(loadedNotices);
      shownUnreadIds.current = new Set(
        loadedNotices.filter((notice) => !notice.readAt).map((notice) => notice.id),
      );
      setLoading(false);
    })().catch((caught) => {
      if (!active) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Notifications could not be loaded.",
      );
      setLoading(false);
    });

    return () => {
      active = false;
      markShownUnreadAsRead();
    };
  }, [markShownUnreadAsRead, navigate]);

  useEffect(() => {
    const handlePageHide = () => markShownUnreadAsRead();
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [markShownUnreadAsRead]);

  const unreadCount = notices.filter((notice) => !notice.readAt).length;
  const readCount = notices.length - unreadCount;

  const filteredNotices = useMemo(() => {
    if (filter === "unread") {
      return notices.filter((notice) => !notice.readAt);
    }
    if (filter === "read") {
      return notices.filter((notice) => Boolean(notice.readAt));
    }
    return notices;
  }, [filter, notices]);

  const groupedNotices = useMemo(() => {
    const groups = new Map<NotificationGroup, CustomerNotification[]>();
    filteredNotices.forEach((notice) => {
      const group = notificationGroup(notice.createdAt);
      groups.set(group, [...(groups.get(group) ?? []), notice]);
    });
    return GROUP_ORDER.map((label) => ({
      label,
      notices: groups.get(label) ?? [],
    })).filter((group) => group.notices.length > 0);
  }, [filteredNotices]);

  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <header className="bg-white">
        <div className="relative mx-auto flex max-w-4xl items-start justify-center px-4 pb-5 pt-6 md:px-6 md:pb-6 md:pt-8">
          <Link
            to="/home"
            onClick={markShownUnreadAsRead}
            className="absolute left-4 top-6 flex h-11 w-11 items-center justify-center rounded-full !bg-white !text-[#1A1A1A] transition-colors hover:!bg-[#F1F3F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30 md:left-6 md:top-8"
            aria-label="Back to home"
          >
            <FaArrowLeft className="text-lg" aria-hidden="true" />
          </Link>

          <Link
            to="/home"
            onClick={markShownUnreadAsRead}
            className="flex flex-col items-center rounded-xl text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
            aria-label="Craves home"
          >
            <CravesLogo size="sm" decorative />
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F62E18]">
              Stay updated
            </p>
            <span className="mt-1 block text-3xl font-semibold leading-tight text-[#1A1A1A]">
              Notifications
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-8 pt-3 md:px-6 md:pb-10 md:pt-4">
        {!loading && !error && notices.length > 0 ? (
          <div className="mb-6 flex items-center justify-between gap-4">
            <div
              className="inline-flex rounded-xl bg-[#F1F3F5] p-1"
              aria-label="Notification filters"
            >
              {(
                [
                  ["all", "All", notices.length],
                  ["unread", "Unread", unreadCount],
                  ["read", "Read", readCount],
                ] as const
              ).map(([value, label, count]) => {
                const active = filter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    aria-pressed={active}
                    className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30 sm:px-4 ${
                      active
                        ? "bg-white text-[#F62E18] shadow-sm"
                        : "text-[#6B6B6B] hover:text-[#1A1A1A]"
                    }`}
                  >
                    {label}
                    <span className="ml-1.5 text-xs font-medium">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {loading ? (
          <div aria-busy="true" className="space-y-3">
            <span className="sr-only">Loading notifications</span>
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-2xl border border-[#E5E7EB] bg-[#F1F3F5]"
              />
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-2xl border border-[#F62E18]/20 bg-white p-5 text-sm text-[#C92716] shadow-sm"
          >
            {error}
          </div>
        ) : notices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white p-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <FaBell className="text-xl" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-[#1A1A1A]">
              No notifications yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              Updates about your orders, deliveries and account will appear here.
            </p>
          </div>
        ) : filteredNotices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white p-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <FaBell className="text-xl" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-[#1A1A1A]">
              {filter === "unread" ? "You're all caught up" : "No read notifications yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              {filter === "unread"
                ? "You have no unread notifications."
                : "Notifications you have already viewed will appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedNotices.map((group) => (
              <section key={group.label} aria-labelledby={`notifications-${group.label.replaceAll(" ", "-").toLowerCase()}`}>
                <h2
                  id={`notifications-${group.label.replaceAll(" ", "-").toLowerCase()}`}
                  className="mb-3 text-sm font-semibold text-[#1A1A1A]"
                >
                  {group.label}
                </h2>
                <ul className="space-y-3">
                  {group.notices.map((notice) => {
                    const unread = !notice.readAt;
                    return (
                      <li key={notice.id}>
                        <article className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5">
                          <div className="flex items-start gap-3 sm:gap-4">
                            <span className="mt-[18px] flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                              {unread ? (
                                <span
                                  className="h-2.5 w-2.5 rounded-full bg-[#F62E18]"
                                  aria-label="Unread notification"
                                />
                              ) : null}
                            </span>
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                              <NotificationTypeIcon notice={notice} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3
                                className={`text-[15px] leading-6 text-[#1A1A1A] ${
                                  unread ? "font-bold" : "font-semibold"
                                }`}
                              >
                                {notice.title}
                              </h3>
                              <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
                                {notice.body}
                              </p>
                              <p className="mt-2 text-xs text-[#6B6B6B]">
                                {notificationTimestamp(notice.createdAt)}
                                <span aria-hidden="true"> · </span>
                                <span>{unread ? "Unread" : "Read"}</span>
                              </p>
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            <p className="text-center text-sm text-[#6B6B6B]">
              You&apos;ve reached the end
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
