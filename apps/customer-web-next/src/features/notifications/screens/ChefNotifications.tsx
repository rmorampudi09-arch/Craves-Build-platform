"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Bell, CalendarCheck, Check, ClipboardList, RefreshCw, Star, Wallet } from "lucide-react";
import {
  CHEF_NOTICE_FILTERS,
  chefNoticeCategory,
  chefNoticeHref,
  chefNoticeTime,
  isToday,
  markEachRead,
  type ChefNoticeCategory,
  type ChefNoticeFilter,
} from "@/features/notifications/lib/chef-notices";
import {
  isOwnOrderNotice,
  parseCustomerNotifications,
  parseNotificationPage,
  type CustomerNotification,
} from "@/features/notifications/lib/notification-contract";
import { isFeatureUnavailable } from "@/shared/lib/feature-availability";
import { NOTICES_READ_EVENT } from "@/shared/lib/notice-events";
import { sessionFetch } from "@/shared/lib/session-fetch";

const PAGE_SIZE = 50;
const CATEGORY: Record<
  ChefNoticeCategory,
  { icon: ComponentType<{ className?: string }>; color: string }
> = {
  orders: { icon: ClipboardList, color: "text-[#C4200F]" },
  money: { icon: Wallet, color: "text-[#0E6B4C]" },
  reviews: { icon: Star, color: "text-[#8A5300]" },
  plans: { icon: CalendarCheck, color: "text-[#1A1A1A]" },
  other: { icon: Bell, color: "text-[#6B6B6B]" },
};
const MARK_ALL_FAILED = "We couldn't mark your notifications as read. Try again.";
const MARK_ALL_PARTIAL = "Some notifications could not be marked as read.";

type Page = { notices: CustomerNotification[]; cursor: string | null };

async function markRead(id: string) {
  const response = await sessionFetch(`/api/notifications/in-app/${id}/read`, { method: "PATCH" });
  if (!response.ok) throw new Error("MARK_READ_FAILED");
}

/** The paged inbox (Chef Mode notices only); before it is live, today's list of the latest 50. */
async function readPage(cursor: string | null): Promise<Page> {
  const response = await sessionFetch(
    `/api/notifications/in-app/page?limit=${PAGE_SIZE}&role=CHEF${cursor ? `&cursor=${cursor}` : ""}`,
    { cache: "no-store" },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!cursor && isFeatureUnavailable(response.status, body)) {
    const older = await sessionFetch("/api/notifications/in-app?limit=50", { cache: "no-store" });
    const notices = older.ok
      ? parseCustomerNotifications(await older.json().catch(() => null))
      : null;
    if (!notices) throw new Error("NOTIFICATIONS_UNAVAILABLE");
    return { notices, cursor: null };
  }
  const page = response.ok ? parseNotificationPage(body) : null;
  if (!page) throw new Error("NOTIFICATIONS_UNAVAILABLE");
  return { notices: page.notices, cursor: page.hasMore ? page.nextCursor : null };
}

/** Chef Mode notifications, like the app: Orders, Money and Reviews filters, and each notice opens its page. */
export default function ChefNotifications() {
  const [notices, setNotices] = useState<CustomerNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [now, setNow] = useState(() => new Date());
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<ChefNoticeFilter>("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    readPage(null)
      .then((page) => {
        if (!active) return;
        setNotices(page.notices.filter((notice) => !isOwnOrderNotice(notice)));
        setCursor(page.cursor);
        setNow(new Date());
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMessage("");
    try {
      const page = await readPage(cursor);
      setNotices((current) => [
        ...current,
        ...page.notices.filter(
          (notice) => !isOwnOrderNotice(notice) && !current.some((item) => item.id === notice.id),
        ),
      ]);
      setCursor(page.cursor);
    } catch {
      setMessage("More notifications didn’t load. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  function markLocally(ids: string[]) {
    const readAt = new Date().toISOString();
    setNotices((current) =>
      current.map((notice) =>
        ids.includes(notice.id) && !notice.readAt ? { ...notice, readAt } : notice,
      ),
    );
  }

  // Opening a notice counts as reading it; the list catches up even if the request fails.
  function open(notice: CustomerNotification) {
    if (notice.readAt) return;
    markLocally([notice.id]);
    void markRead(notice.id).then(
      () => window.dispatchEvent(new Event(NOTICES_READ_EVENT)),
      () => undefined,
    );
  }

  async function markAll() {
    setMarkingAll(true);
    setMessage("");
    const unread = notices.filter((notice) => !notice.readAt).map((notice) => notice.id);
    try {
      const marked = await markEachRead(unread, markRead);
      markLocally(marked);
      window.dispatchEvent(new Event(NOTICES_READ_EVENT));
      if (marked.length < unread.length) setMessage(MARK_ALL_PARTIAL);
    } catch {
      setMessage(MARK_ALL_FAILED);
    } finally {
      setMarkingAll(false);
    }
  }

  const unread = notices.filter((notice) => !notice.readAt);
  const visible = useMemo(
    () => notices.filter((notice) => filter === "all" || chefNoticeCategory(notice) === filter),
    [filter, notices],
  );
  const groups = [
    { title: "Today", rows: visible.filter((notice) => isToday(notice.createdAt, now)) },
    { title: "Earlier", rows: visible.filter((notice) => !isToday(notice.createdAt, now)) },
  ].filter((group) => group.rows.length > 0);
  const filterLabel = CHEF_NOTICE_FILTERS.find((item) => item.id === filter)?.label ?? "All";

  let body: ReactNode;
  if (status === "loading") {
    body = (
      <div className="grid gap-3" role="status" aria-label="Loading notifications">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="chef-skeleton h-[4.5rem] w-full motion-reduce:animate-none"
            aria-hidden="true"
          />
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <section className="chef-section chef-section-body">
        <h2 className="chef-section-title">We couldn&apos;t load your notifications</h2>
        <p role="alert" className="mt-1 text-[0.875rem] text-[#6B6B6B]">
          Check your connection and try again.
        </p>
        <button
          type="button"
          className="chef-btn mt-3"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </section>
    );
  } else if (visible.length === 0 && !cursor) {
    body = (
      <section className="chef-section chef-empty">
        <span className="chef-empty-icon">
          <Bell className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="chef-empty-title">
          {filter === "all" ? "No notifications yet" : `No ${filterLabel} notifications`}
        </h2>
        <p className="chef-empty-text">
          {filter === "all"
            ? "New orders, payouts and reviews will show up here."
            : "Try the All tab to see everything else."}
        </p>
      </section>
    );
  } else {
    body = groups.map((group) => (
      <section key={group.title} aria-labelledby={`notices-${group.title}`}>
        <h2
          id={`notices-${group.title}`}
          className="mb-2 px-1 text-[0.8125rem] font-semibold text-[#6B6B6B]"
        >
          {group.title}
        </h2>
        <ul className="chef-section chef-list">
          {group.rows.map((notice) => {
            const { icon: Icon, color } = CATEGORY[chefNoticeCategory(notice)];
            const href = chefNoticeHref(notice);
            const time = chefNoticeTime(notice.createdAt, now);
            const inner = (
              <>
                <span className={`chef-row-icon ${color}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="chef-row-main">
                  <span
                    className={`block text-[0.9375rem] leading-snug text-[#1A1A1A] ${notice.readAt ? "font-semibold" : "font-bold"}`}
                  >
                    {notice.title}
                  </span>
                  <span className="chef-row-meta block">{notice.body}</span>
                  <span className="mt-0.5 block text-xs text-[#6B6B6B]">
                    {time}
                    {notice.readAt ? null : <span className="sr-only">, unread</span>}
                  </span>
                </span>
                {notice.readAt ? null : (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#C4200F]"
                    aria-hidden="true"
                  />
                )}
              </>
            );
            const rowClass = `chef-row ${notice.readAt ? "" : "bg-[#F7F8FA]"}`;
            return (
              <li key={notice.id}>
                {href ? (
                  <Link href={href} className={rowClass} onClick={() => open(notice)}>
                    {inner}
                  </Link>
                ) : notice.readAt ? (
                  <div className={rowClass}>{inner}</div>
                ) : (
                  <button
                    type="button"
                    className={rowClass}
                    onClick={() => open(notice)}
                    aria-label={`${notice.title}. ${notice.body}. ${time}. Unread, mark as read`}
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    ));
  }

  return (
    <div className="chef-stack" aria-busy={status === "loading"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="chef-chips" role="group" aria-label="Show notifications about">
          {CHEF_NOTICE_FILTERS.map(({ id, label }) => {
            const count =
              id === "all"
                ? 0
                : unread.filter((notice) => chefNoticeCategory(notice) === id).length;
            return (
              <button
                key={id}
                type="button"
                className="chef-chip"
                aria-pressed={filter === id}
                aria-label={count ? `${label}, ${count} unread` : undefined}
                onClick={() => setFilter(id)}
              >
                {label}
                {count ? (
                  <span className="chef-chip-count">{count > 99 ? "99+" : count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {unread.length ? (
          <button
            type="button"
            className="chef-btn is-small is-quiet"
            disabled={markingAll}
            aria-busy={markingAll}
            onClick={() => void markAll()}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {markingAll ? "Marking as read…" : "Mark all read"}
          </button>
        ) : null}
      </div>
      <p
        role="status"
        className={message ? "text-[0.875rem] font-medium text-[#C4200F]" : "sr-only"}
      >
        {message}
      </p>
      {body}
      {status === "ready" && cursor ? (
        <button
          type="button"
          className="chef-btn is-block"
          disabled={loadingMore}
          aria-busy={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
