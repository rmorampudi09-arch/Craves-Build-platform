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
import { format, messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";
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
// Filter words by filter id (chef-notices.ts keeps the English ones), then the screen's own.
const TEXT = messages({
  en: {
    all: "All", orders: "Orders", money: "Money", reviews: "Reviews",
    markAllFailed: "We couldn't mark your notifications as read. Try again.", markAllPartial: "Some notifications could not be marked as read.",
    moreFailed: "More notifications didn’t load. Try again.", today: "Today", earlier: "Earlier", loading: "Loading notifications",
    failedTitle: "We couldn't load your notifications", checkConnection: "Check your connection and try again.", tryAgain: "Try again",
    none: "No notifications yet", noneFor: "No {filter} notifications", noneText: "New orders, payouts and reviews will show up here.",
    tryAll: "Try the All tab to see everything else.", unread: ", unread", unreadLabel: "{title}. {body}. {time}. Unread, mark as read",
    showAbout: "Show notifications about", filterUnread: "{label}, {count} unread", marking: "Marking as read…", markAll: "Mark all read",
    loadingMore: "Loading…", loadMore: "Load more",
  },
  te: {
    all: "అన్నీ", orders: "ఆర్డర్లు", money: "డబ్బు", reviews: "రివ్యూలు",
    markAllFailed: "మీ నోటిఫికేషన్లను చదివినట్లు గుర్తించలేకపోయాం. మళ్లీ ప్రయత్నించండి.", markAllPartial: "కొన్ని నోటిఫికేషన్లను చదివినట్లు గుర్తించలేకపోయాం.",
    moreFailed: "మరిన్ని నోటిఫికేషన్లు లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.", today: "ఈరోజు", earlier: "ఇంతకుముందు", loading: "నోటిఫికేషన్లు లోడ్ అవుతున్నాయి",
    failedTitle: "మీ నోటిఫికేషన్లు లోడ్ చేయలేకపోయాం", checkConnection: "ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.", tryAgain: "మళ్లీ ప్రయత్నించండి",
    none: "ఇంకా నోటిఫికేషన్లు లేవు", noneFor: "{filter} నోటిఫికేషన్లు లేవు", noneText: "కొత్త ఆర్డర్లు, బ్యాంక్‌కు పంపిన డబ్బు, రివ్యూలు ఇక్కడ కనిపిస్తాయి.",
    tryAll: "మిగతావన్నీ చూడటానికి “అన్నీ” నొక్కండి.", unread: ", చదవలేదు", unreadLabel: "{title}. {body}. {time}. చదవలేదు, చదివినట్లు గుర్తించండి",
    showAbout: "వీటి గురించి నోటిఫికేషన్లు చూపించండి", filterUnread: "{label}, {count} చదవలేదు", marking: "చదివినట్లు గుర్తిస్తున్నాం…", markAll: "అన్నీ చదివినట్లు గుర్తించండి",
    loadingMore: "లోడ్ అవుతోంది…", loadMore: "ఇంకా చూపించండి",
  },
  kn: {
    all: "ಎಲ್ಲಾ", orders: "ಆರ್ಡರ್‌ಗಳು", money: "ಹಣ", reviews: "ರಿವ್ಯೂಗಳು",
    markAllFailed: "ನಿಮ್ಮ ಅಧಿಸೂಚನೆಗಳನ್ನು ಓದಿದಂತೆ ಗುರುತಿಸಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", markAllPartial: "ಕೆಲವು ಅಧಿಸೂಚನೆಗಳನ್ನು ಓದಿದಂತೆ ಗುರುತಿಸಲು ಆಗಲಿಲ್ಲ.",
    moreFailed: "ಇನ್ನಷ್ಟು ಅಧಿಸೂಚನೆಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", today: "ಇಂದು", earlier: "ಹಿಂದಿನವು", loading: "ಅಧಿಸೂಚನೆಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ",
    failedTitle: "ನಿಮ್ಮ ಅಧಿಸೂಚನೆಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ", checkConnection: "ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    none: "ಇನ್ನೂ ಅಧಿಸೂಚನೆಗಳಿಲ್ಲ", noneFor: "{filter} ಅಧಿಸೂಚನೆಗಳಿಲ್ಲ", noneText: "ಹೊಸ ಆರ್ಡರ್‌ಗಳು, ಬ್ಯಾಂಕ್‌ಗೆ ಕಳುಹಿಸಿದ ಹಣ, ರಿವ್ಯೂಗಳು ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.",
    tryAll: "ಉಳಿದೆಲ್ಲವನ್ನೂ ನೋಡಲು “ಎಲ್ಲಾ” ಒತ್ತಿ.", unread: ", ಓದಿಲ್ಲ", unreadLabel: "{title}. {body}. {time}. ಓದಿಲ್ಲ, ಓದಿದಂತೆ ಗುರುತಿಸಿ",
    showAbout: "ಇವುಗಳ ಬಗ್ಗೆ ಅಧಿಸೂಚನೆ ತೋರಿಸಿ", filterUnread: "{label}, {count} ಓದಿಲ್ಲ", marking: "ಓದಿದಂತೆ ಗುರುತಿಸುತ್ತಿದ್ದೇವೆ…", markAll: "ಎಲ್ಲಾ ಓದಿದಂತೆ ಗುರುತಿಸಿ",
    loadingMore: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…", loadMore: "ಇನ್ನಷ್ಟು ತೋರಿಸಿ",
  },
});

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
  const text = useText(TEXT);
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
      setMessage(text.moreFailed);
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
      if (marked.length < unread.length) setMessage(text.markAllPartial);
    } catch {
      setMessage(text.markAllFailed);
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
    { id: "Today", title: text.today, rows: visible.filter((notice) => isToday(notice.createdAt, now)) },
    { id: "Earlier", title: text.earlier, rows: visible.filter((notice) => !isToday(notice.createdAt, now)) },
  ].filter((group) => group.rows.length > 0);

  let body: ReactNode;
  if (status === "loading") {
    body = (
      <div className="grid gap-3" role="status" aria-label={text.loading}>
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
        <h2 className="chef-section-title">{text.failedTitle}</h2>
        <p role="alert" className="mt-1 text-[0.875rem] text-[#6B6B6B]">
          {text.checkConnection}
        </p>
        <button
          type="button"
          className="chef-btn mt-3"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {text.tryAgain}
        </button>
      </section>
    );
  } else if (visible.length === 0) {
    body = (
      <section className="chef-section chef-empty">
        <span className="chef-empty-icon">
          <Bell className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="chef-empty-title">
          {filter === "all" ? text.none : format(text.noneFor, { filter: text[filter] })}
        </h2>
        <p className="chef-empty-text">{filter === "all" ? text.noneText : text.tryAll}</p>
      </section>
    );
  } else {
    body = groups.map((group) => (
      <section key={group.id} aria-labelledby={`notices-${group.id}`}>
        <h2
          id={`notices-${group.id}`}
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
                    {notice.readAt ? null : <span className="sr-only">{text.unread}</span>}
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
            const rowClass = `chef-row !border-0 ${notice.readAt ? "" : "bg-[#F7F8FA]"}`;
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
                    aria-label={format(text.unreadLabel, { title: notice.title, body: notice.body, time })}
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
        <div className="chef-chips" role="group" aria-label={text.showAbout}>
          {CHEF_NOTICE_FILTERS.map(({ id }) => {
            const label = text[id];
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
                aria-label={count ? format(text.filterUnread, { label, count }) : undefined}
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
            {markingAll ? text.marking : text.markAll}
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
          {loadingMore ? text.loadingMore : text.loadMore}
        </button>
      ) : null}
    </div>
  );
}
