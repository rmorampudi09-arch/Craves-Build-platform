"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, Check, ChefHat, ChevronRight, Mail, RefreshCw, ShoppingBag, Tag, Trash2 } from "lucide-react";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { useCustomerUnreadCount } from "@/shared/components/notifications/unread-badge";
import { NOTICES_READ_EVENT } from "@/shared/lib/notice-events";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { EmptyState, emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";
import { UndoToast } from "@/shared/ui/overlays/undo-toast";
import {
  isKitchenNotice,
  parseCustomerNotifications,
  parseNotificationPage,
  type CustomerNotification,
} from "@/features/notifications/lib/notification-contract";
import {
  categoryCounts,
  NOTICE_CATEGORIES,
  noticeCategory,
  noticeHref,
  type NoticeCategory,
} from "@/features/notifications/lib/customer-notices";
import { markEachRead } from "@/features/notifications/lib/chef-notices";
import { loadSession } from "@/features/auth/api/cravesAuth";

type NotificationGroup = "Today" | "This week" | "Earlier";
type Problem = "session" | "offline" | "error";

const GROUP_ORDER: NotificationGroup[] = ["Today", "This week", "Earlier"];
const PAGE_SIZE = 50;
const ICONS: Record<Exclude<NoticeCategory, "ALL">, ComponentType<{ className?: string }>> = {
  ORDERS: ShoppingBag,
  OFFERS: Tag,
  UPDATES: Bell,
  OTHER: Mail,
};
const ACTION =
  "inline-flex min-h-11 items-center gap-2 rounded-full !border !border-[#E3DDD8] !bg-white px-4 text-sm font-semibold !text-[#261A15] !shadow-none hover:!bg-[#F7F5F3]";

/** The sign-in, not the inbox, is what failed. */
class SignInProblem extends Error {}

function problemOf(caught: unknown): Problem {
  if (caught instanceof SignInProblem) return "session";
  return typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error";
}

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

/** "1:31 pm" today, "Sat, 1:31 pm" this week, "3 Oct, 12:05 pm" before that. */
function notificationTimestamp(createdAt: string, group: NotificationGroup) {
  const created = new Date(createdAt);
  const time = created.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  if (group === "Today") return time;
  const day = group === "This week"
    ? created.toLocaleDateString("en-IN", { weekday: "short" })
    : created.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        ...(created.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
      });
  return `${day}, ${time}`;
}

function clearedKey(identityId: string): string {
  return "craves.notifications.cleared:" + identityId;
}

function readCleared(identityId: string): Set<string> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(clearedKey(identityId)) || "[]");
    return new Set(Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

function persistCleared(identityId: string, ids: string[]) {
  if (!identityId || ids.length === 0) return;
  const current = readCleared(identityId);
  window.localStorage.setItem(
    clearedKey(identityId),
    JSON.stringify(Array.from(new Set([...current, ...ids])).slice(-250)),
  );
}

async function markRead(id: string) {
  const response = await sessionFetch(`/api/notifications/in-app/${id}/read`, { method: "PATCH" });
  if (!response.ok) throw new Error("MARK_READ_FAILED");
}

const noticesRead = () => window.dispatchEvent(new Event(NOTICES_READ_EVENT));

/** One page of the inbox, newest first. Before the paged inbox is live (or if it fails), today's latest 50. */
async function readPage(cursor: string | null): Promise<{ notices: CustomerNotification[]; cursor: string | null }> {
  const response = await sessionFetch(`/api/notifications/in-app/page?limit=${PAGE_SIZE}${cursor ? `&cursor=${cursor}` : ""}`, { cache: "no-store" });
  if (response.status === 401) throw new SignInProblem();
  const body: unknown = await response.json().catch(() => null);
  if (!cursor && !response.ok) {
    const latest = await sessionFetch(`/api/notifications/in-app?limit=${PAGE_SIZE}`, { cache: "no-store" });
    if (latest.status === 401) throw new SignInProblem();
    const notices = latest.ok ? parseCustomerNotifications(await latest.json().catch(() => null)) : null;
    if (!notices) throw new Error("NOTIFICATIONS_UNAVAILABLE");
    return { notices, cursor: null };
  }
  const page = response.ok ? parseNotificationPage(body) : null;
  if (!page) throw new Error("NOTIFICATIONS_UNAVAILABLE");
  return { notices: page.notices, cursor: page.hasMore ? page.nextCursor : null };
}

function NoticeIcon({ notice }: { notice: CustomerNotification }) {
  const Icon = isKitchenNotice(notice) ? ChefHat : ICONS[noticeCategory(notice)];
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

/** Notifications, like the app: the unread count, Orders / Offers / Updates / Other chips, and each row opens its order, delivery or kitchen. */
export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notices, setNotices] = useState<CustomerNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [category, setCategory] = useState<NoticeCategory>("ALL");
  const [status, setStatus] = useState<"loading" | "ready" | Problem>("loading");
  const [identityId, setIdentityId] = useState("");
  const [pendingClear, setPendingClear] = useState<{ id: number; ids: string[] } | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [actionError, setActionError] = useState("");
  const clearCount = useRef(0);
  const noticesRef = useRef(notices);
  const unmountCommit = useRef({ identityId: "", ids: [] as string[] });
  const serverUnread = useCustomerUnreadCount(identityId !== "");

  /** Saves a clear. Cleared unread notices are marked read too, so the bell never counts what this page hides. */
  const commitClear = useCallback((owner: string, ids: string[]) => {
    persistCleared(owner, ids);
    const unread = noticesRef.current.filter((notice) => ids.includes(notice.id) && !notice.readAt).map((notice) => notice.id);
    if (unread.length) void markEachRead(unread, markRead).then(noticesRead, () => undefined);
  }, []);

  // Leaving the page while Undo is still offered keeps the clear.
  useEffect(() => {
    noticesRef.current = notices;
    unmountCommit.current = { identityId, ids: pendingClear?.ids ?? [] };
  });
  useEffect(() => () => commitClear(unmountCommit.current.identityId, unmountCommit.current.ids), [commitClear]);

  const start = useCallback(
    (isActive: () => boolean = () => true) => {
      void (async () => {
        let session;
        try {
          session = await loadSession({ keepOnOutage: true });
        } catch {
          // The sign-in couldn't be checked (offline, or Craves didn't answer): not the same as signed out.
          if (isActive()) setStatus("session");
          return;
        }
        if (!isActive()) return;
        if (!session) {
          navigate({ to: "/" });
          return;
        }
        setIdentityId(session.id);
        try {
          const page = await readPage(null);
          if (!isActive()) return;
          const cleared = readCleared(session.id);
          setNotices(page.notices.filter((notice) => !cleared.has(notice.id)));
          setCursor(page.cursor);
          setStatus("ready");
        } catch (caught) {
          if (isActive()) setStatus(problemOf(caught));
        }
      })();
    },
    [navigate],
  );

  useEffect(() => {
    let active = true;
    start(() => active);
    return () => {
      active = false;
    };
  }, [start]);

  async function loadOlder() {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    setActionError("");
    try {
      const page = await readPage(cursor);
      const cleared = readCleared(identityId);
      setNotices((current) => [
        ...current,
        ...page.notices.filter((notice) => !cleared.has(notice.id) && !current.some((item) => item.id === notice.id)),
      ]);
      setCursor(page.cursor);
    } catch {
      setActionError("Older notifications didn’t load. Try again.");
    } finally {
      setLoadingOlder(false);
    }
  }

  // Opening a notice counts as reading it; the list catches up even if the request fails.
  function openNotice(notice: CustomerNotification) {
    if (notice.readAt) return;
    const readAt = new Date().toISOString();
    setNotices((current) => current.map((item) => (item.id === notice.id ? { ...item, readAt } : item)));
    void markRead(notice.id).then(noticesRead, () => undefined);
  }

  function finishClear(ids: string[]) {
    commitClear(identityId, ids);
    setNotices((current) => current.filter((notice) => !ids.includes(notice.id)));
  }

  // Clearing hides at once but only saves once the Undo toast has expired.
  function clearNotices(ids: string[]) {
    if (ids.length === 0) return;
    if (pendingClear) finishClear(pendingClear.ids);
    clearCount.current += 1;
    setPendingClear({ id: clearCount.current, ids });
  }

  async function markAllRead() {
    setMarkingRead(true);
    setActionError("");
    try {
      const response = await sessionFetch("/api/notifications/in-app/read-all", { method: "PATCH" });
      if (!response.ok) throw new Error("read-all failed");
      const readAt = new Date().toISOString();
      setNotices((current) => current.map((notice) => notice.readAt ? notice : { ...notice, readAt }));
      noticesRead();
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
  const listUnread = visibleNotices.filter((notice) => !notice.readAt).length;
  // Everything loaded: the list's own count. More to load: the inbox's count from the server, which includes those.
  const unreadCount = cursor && serverUnread !== null ? Math.max(serverUnread, listUnread) : listUnread;
  const readCount = visibleNotices.length - listUnread;
  const counts = useMemo(() => categoryCounts(visibleNotices), [visibleNotices]);
  const filteredNotices = useMemo(
    () => (category === "ALL" ? visibleNotices : visibleNotices.filter((notice) => noticeCategory(notice) === category)),
    [category, visibleNotices],
  );

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

  const retry = () => {
    setStatus("loading");
    start();
  };

  let body;
  if (status === "loading") {
    body = <CustomerSectionSkeleton variant="notifications" label="Loading notifications" />;
  } else if (status === "session") {
    body = (
      <EmptyState
        illustration="session"
        title="We couldn’t sign you back in"
        message="Check your connection and try again. You can also sign in again with your phone number."
        role="alert"
      >
        <button type="button" onClick={retry} className="craves-primary-action">
          Try again
        </button>
        <a href={`/sign-in?returnTo=${encodeURIComponent("/notifications")}`} className={emptyStateSecondaryAction}>
          Go to sign in
        </a>
      </EmptyState>
    );
  } else if (status === "offline" || status === "error") {
    body = (
      <EmptyState
        illustration={status === "offline" ? "offline" : "loadError"}
        title={status === "offline" ? "You’re offline" : "We couldn’t load your notifications"}
        message={status === "offline" ? "Check your Wi‑Fi or mobile data, then try again." : "Check your connection and try again."}
        role="alert"
      >
        <button type="button" onClick={retry} className="craves-primary-action">
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
          Try again
        </button>
      </EmptyState>
    );
  } else if (visibleNotices.length === 0) {
    body = (
      <EmptyState
        illustration="notifications"
        title="No notifications yet"
        message="Order updates, offers and messages from Craves will show up here."
      >
        {cursor ? (
          <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className={ACTION}>
            {loadingOlder ? "Loading…" : "Load older notifications"}
          </button>
        ) : null}
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div role="group" aria-label="Notification categories" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
          {NOTICE_CATEGORIES.map(({ id, label }) => {
            const selected = category === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategory(id)}
                className={`min-h-11 shrink-0 rounded-full !border px-4 text-[0.9375rem] font-semibold !shadow-none ${
                  selected
                    ? "!border-[#D92714] !bg-[#D92714] !text-white"
                    : "!border-[#D5CEC8] !bg-white !text-[#261A15] hover:!bg-[#F7F5F3]"
                }`}
              >
                {label} {counts[id]}
              </button>
            );
          })}
        </div>

        {filteredNotices.length === 0 ? (
          <div className="mt-5 rounded-[20px] border border-[#E3DDD8] px-6 py-10 text-center">
            <h2 className="text-xl font-bold text-[#261A15]">Nothing in this category</h2>
            <p className="mt-1 text-[0.9375rem] text-[#706864]">Try another notification category.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {groupedNotices.map((group) => {
              const headingId = `notifications-${group.label.replaceAll(" ", "-").toLowerCase()}`;
              return (
                <section key={group.label} aria-labelledby={headingId}>
                  <h2 id={headingId} className="mb-2 text-[1.0625rem] font-bold text-[#261A15]">
                    {group.label}
                  </h2>
                  <ul className="divide-y divide-[#E3DDD8] overflow-hidden rounded-[20px] border border-[#E3DDD8] bg-white">
                    {group.notices.map((notice) => {
                      const unread = !notice.readAt;
                      const href = noticeHref(notice);
                      // Its ::after covers the row, so the whole row opens the notice; focus rings the row.
                      const cover = "text-left after:absolute after:inset-0 focus-visible:!outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-[#1A1A1A]";
                      return (
                        <li key={notice.id} className="relative flex items-start gap-3 p-4 transition-colors duration-150 hover:bg-[#FCFBFA]">
                          <NoticeIcon notice={notice} />
                          <div className="min-w-0 flex-1">
                            <h3 className={`line-clamp-2 text-[1.0625rem] leading-6 text-[#261A15] ${unread ? "font-bold" : "font-semibold"}`}>
                              {href ? (
                                <Link to={href} onClick={() => openNotice(notice)} className={cover}>
                                  {notice.title}
                                </Link>
                              ) : unread ? (
                                <button
                                  type="button"
                                  onClick={() => openNotice(notice)}
                                  className={`!m-0 !min-h-0 !min-w-0 !border-0 !bg-transparent !p-0 font-[inherit] !text-[#261A15] !shadow-none ${cover}`}
                                >
                                  {notice.title}
                                  <span className="sr-only">, mark as read</span>
                                </button>
                              ) : (
                                notice.title
                              )}
                            </h3>
                            <p className="mt-0.5 line-clamp-3 text-[0.9375rem] leading-6 text-[#706864]">{notice.body}</p>
                            <p className="mt-1.5 text-xs text-[#7D7570]">
                              {notificationTimestamp(notice.createdAt, group.label)}
                              <span className="sr-only">{unread ? ", unread" : ", read"}</span>
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1 self-center">
                            {unread ? <span className="h-2 w-2 rounded-full bg-[#F62E18]" aria-hidden="true" /> : null}
                            {!unread ? (
                              <button
                                type="button"
                                onClick={() => clearNotices([notice.id])}
                                className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full !border-0 !bg-transparent !text-[#706864] !shadow-none hover:!bg-[#F7F5F3] hover:!text-[#D92714]"
                                aria-label={`Clear ${notice.title}`}
                                title="Clear read notification"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            ) : null}
                            {href ? <ChevronRight className="h-4 w-4 text-[#7D7570]" aria-hidden="true" /> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex flex-col items-center gap-2">
          {cursor ? (
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingOlder}
              aria-busy={loadingOlder}
              className="min-h-11 rounded-full !border !border-[#D92714] !bg-white px-6 text-[0.9375rem] font-semibold !text-[#D92714] !shadow-none hover:!bg-[#FDEAE8]"
            >
              {loadingOlder ? "Loading…" : "Load older notifications"}
            </button>
          ) : (
            <p className="text-center text-sm text-[#706864]">You&apos;ve reached the end</p>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-12 text-[#261A15]">
      <AutoHideCustomerHeader className="border-b border-border bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 md:px-6">
          <Link
            to="/home"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link to="/home" className="shrink-0 rounded-lg" aria-label="Craves home">
            <CravesLogo size="sm" decorative />
          </Link>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-4xl px-4 pb-8 pt-5 md:px-6 md:pb-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-[#261A15]">Notifications</h1>
            {status === "ready" ? (
              <p aria-live="polite" className="mt-1 text-[0.9375rem] text-[#706864]">
                {unreadCount > 0 ? `${unreadCount} unread` : "You are caught up"}
              </p>
            ) : null}
          </div>
          {status === "ready" && visibleNotices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {listUnread > 0 ? (
                <button
                  type="button"
                  disabled={markingRead}
                  aria-busy={markingRead}
                  onClick={() => void markAllRead()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full !border !border-[#D92714] !bg-white px-4 text-sm font-semibold !text-[#D92714] !shadow-none hover:!bg-[#FDEAE8]"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {markingRead ? "Marking as read…" : "Mark all as read"}
                </button>
              ) : null}
              {readCount > 0 ? (
                <button
                  type="button"
                  onClick={() => clearNotices(visibleNotices.filter((notice) => Boolean(notice.readAt)).map((notice) => notice.id))}
                  className={ACTION}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Clear read
                </button>
              ) : null}
              <button type="button" onClick={() => clearNotices(visibleNotices.map((notice) => notice.id))} className={ACTION}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear all
              </button>
            </div>
          ) : null}
        </div>
        {actionError ? (
          <p role="alert" className="mt-3 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]">
            {actionError}
          </p>
        ) : null}

        {body}
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
          if (pendingClear) finishClear(pendingClear.ids);
          setPendingClear(null);
        }}
      />
    </div>
  );
}
