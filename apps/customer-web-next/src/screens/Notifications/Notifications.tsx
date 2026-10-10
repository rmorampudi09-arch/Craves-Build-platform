"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FaArrowLeft,
  FaBagShopping,
  FaBell,
  FaCalendarDays,
  FaCheck,
  FaTrashCan,
} from "react-icons/fa6";
import { GiChefToque } from "react-icons/gi";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";
import { UndoToast } from "@/components/ui/overlays/undo-toast";
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

function clearedKey(identityId: string): string {
  return "craves.notifications.cleared:" + identityId;
}

function persistCleared(identityId: string, ids: string[]) {
  if (!identityId || ids.length === 0) return;
  let current: string[] = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(clearedKey(identityId)) || "[]");
    current = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    current = [];
  }
  window.localStorage.setItem(
    clearedKey(identityId),
    JSON.stringify(Array.from(new Set([...current, ...ids])).slice(-250)),
  );
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
  const [identityId, setIdentityId] = useState("");
  const [pendingClear, setPendingClear] = useState<{ id: number; ids: string[] } | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const [actionError, setActionError] = useState("");
  const clearCount = useRef(0);
  const unmountCommit = useRef({ identityId: "", ids: [] as string[] });

  // Leaving the page while Undo is still offered keeps the clear.
  useEffect(() => {
    unmountCommit.current = { identityId, ids: pendingClear?.ids ?? [] };
  });
  useEffect(() => () => persistCleared(unmountCommit.current.identityId, unmountCommit.current.ids), []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const session = await loadSession();
      if (!session) {
        if (active) navigate({ to: "/" });
        return;
      }
      if (!active) return;
      setIdentityId(session.id);

      const dismissedKey = clearedKey(session.id);
      let dismissed = new Set<string>();
      try {
        const saved = JSON.parse(window.localStorage.getItem(dismissedKey) || "[]");
        if (Array.isArray(saved)) {
          dismissed = new Set(saved.filter((value): value is string => typeof value === "string"));
        }
      } catch {
        dismissed = new Set();
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

      const loadedNotices = (body as CustomerNotification[]).filter(
        (notice) => !dismissed.has(notice.id),
      );
      setNotices(loadedNotices);
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
    };
  }, [navigate]);

  function commitClear(ids: string[]) {
    persistCleared(identityId, ids);
    setNotices((current) => current.filter((notice) => !ids.includes(notice.id)));
  }

  // Clearing hides at once but only saves once the Undo toast has expired.
  function clearNotices(ids: string[]) {
    if (ids.length === 0) return;
    if (pendingClear) commitClear(pendingClear.ids);
    clearCount.current += 1;
    setPendingClear({ id: clearCount.current, ids });
  }

  async function markAllRead() {
    setMarkingRead(true);
    setActionError("");
    try {
      const response = await fetch("/api/notifications/in-app/read-all", {
        method: "PATCH",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("read-all failed");
      const readAt = new Date().toISOString();
      setNotices((current) => current.map((notice) => notice.readAt ? notice : { ...notice, readAt }));
    } catch {
      setActionError("We couldn’t mark your notifications as read. Please try again.");
    } finally {
      setMarkingRead(false);
    }
  }

  const visibleNotices = useMemo(
    () => (pendingClear ? notices.filter((notice) => !pendingClear.ids.includes(notice.id)) : notices),
    [notices, pendingClear],
  );
  const unreadCount = visibleNotices.filter((notice) => !notice.readAt).length;
  const readCount = visibleNotices.length - unreadCount;

  const filteredNotices = useMemo(() => {
    if (filter === "unread") {
      return visibleNotices.filter((notice) => !notice.readAt);
    }
    if (filter === "read") {
      return visibleNotices.filter((notice) => Boolean(notice.readAt));
    }
    return visibleNotices;
  }, [filter, visibleNotices]);

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

  if (loading) return <CustomerPageSkeleton label="Loading notifications" />;

  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-border bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 md:px-6 md:py-5">
          <Link
            to="/home"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full !bg-white !text-[#1A1A1A] transition-colors hover:!bg-[#F1F3F5]"
            aria-label="Back to home"
          >
            <FaArrowLeft className="text-lg" aria-hidden="true" />
          </Link>
          <Link to="/home" className="shrink-0 rounded-lg" aria-label="Craves home">
            <CravesLogo size="sm" decorative />
          </Link>
          <h1 className="text-xl font-semibold leading-tight text-[#1A1A1A]">
            Notifications
          </h1>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-4xl px-4 pb-8 pt-3 md:px-6 md:pb-10 md:pt-4">
        {!loading && visibleNotices.length > 0 ? (
          <div className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  disabled={markingRead}
                  aria-busy={markingRead}
                  onClick={() => void markAllRead()}
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 text-xs font-bold text-[#1A1A1A]"
                >
                  <FaCheck aria-hidden="true" />
                  {markingRead ? "Marking as read…" : "Mark all as read"}
                </button>
              ) : null}
              {readCount > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    clearNotices(
                      visibleNotices
                        .filter((notice) => Boolean(notice.readAt))
                        .map((notice) => notice.id),
                    )
                  }
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 text-xs font-bold text-[#1A1A1A]"
                >
                  <FaTrashCan aria-hidden="true" />
                  Clear read
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => clearNotices(visibleNotices.map((notice) => notice.id))}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 text-xs font-bold text-[#1A1A1A]"
              >
                <FaTrashCan aria-hidden="true" />
                Clear all
              </button>
            </div>
            <div
              className="flex gap-7 border-b border-[#E5E7EB] sm:gap-9"
              aria-label="Notification filters"
            >
              {(
                [
                  ["all", "All", visibleNotices.length],
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
                    className={`group relative min-h-11 appearance-none border-0 !bg-transparent px-3 pb-2 pt-2 text-sm font-semibold shadow-none outline-none transition-colors duration-200 hover:!bg-transparent focus:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent ${
                      active
                        ? "after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-[#F62E18]"
                        : "after:absolute after:inset-x-2 after:bottom-[-1px] after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-[#F62E18]"
                    }`}
                  >
                    <span className="text-[#1A1A1A] transition-colors duration-200 group-hover:text-[#F62E18] group-focus-visible:text-[#F62E18]">
                      {label} ({count})
                    </span>
                  </button>
                );
              })}
            </div>
            {actionError ? (
              <p role="alert" className="mt-3 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]">
                {actionError}
              </p>
            ) : null}
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
            className="rounded-2xl bg-[#F1F3F5] p-5 text-sm font-medium text-[#C4200F]"
          >
            {error}
          </div>
        ) : visibleNotices.length === 0 ? (
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
                              <div className="mt-2 flex items-center justify-between gap-3">
                                <p className="text-xs text-[#6B6B6B]">
                                  {notificationTimestamp(notice.createdAt)}
                                  <span aria-hidden="true"> · </span>
                                  <span>{unread ? "Unread" : "Read"}</span>
                                </p>
                                {!unread ? (
                                  <button
                                    type="button"
                                    onClick={() => clearNotices([notice.id])}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F3F5] text-[#6B6B6B] transition hover:text-[#F62E18]"
                                    aria-label={`Clear ${notice.title}`}
                                    title="Clear read notification"
                                  >
                                    <FaTrashCan aria-hidden="true" />
                                  </button>
                                ) : null}
                              </div>
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

      <UndoToast
        toast={
          pendingClear
            ? {
                id: pendingClear.id,
                message: `${pendingClear.ids.length} notification${pendingClear.ids.length === 1 ? "" : "s"} cleared`,
              }
            : null
        }
        onUndo={() => setPendingClear(null)}
        onExpire={() => {
          if (pendingClear) commitClear(pendingClear.ids);
          setPendingClear(null);
        }}
      />
    </div>
  );
}
