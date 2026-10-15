"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BadgeIndianRupee, CalendarDays } from "lucide-react";
import {
  ChefOrderHistoryError,
  fetchChefOrderHistoryPage,
} from "@/features/chef/api/chef-order-history";
import {
  chefOrderStatus,
  ChefEmpty,
  ChefPill,
  ChefSection,
  ChefSkeleton,
  formatInr,
} from "@/features/chef/components/chef-ui";
import type { ChefEarning } from "@/features/chef/lib/chef-earnings-contract";
import {
  DAY_MS,
  earningsPreviousBounds,
  earningsRangeBounds,
  istDayFromInput,
  istDayName,
  istDayStart,
  istInputValue,
  MAX_HISTORY_ORDERS,
  MAX_RANGE_DAYS,
  olderOrdersMissing,
  ordersCoverFrom,
  ordersOnDay,
  periodText,
  summarizeEarnings,
  type EarningsRange,
  type EarningsSummary,
} from "@/features/chef/lib/chef-earnings-insights";
import { parseChefMenuItems } from "@/features/chef/lib/chef-menu-contract";
import { parseChefOrdersResponse, type ChefOrder } from "@/features/chef/lib/chef-order-contract";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { secondaryActionClass, Sheet } from "@/shared/ui/overlays/overlay";

/** The earnings read's limit (src/app/api/chef/earnings): a list this long may be missing its oldest entries. */
const EARNINGS_LIMIT = 200;
const HISTORY_PAGE = 50;
const MAX_LABELLED_BARS = 14;
const PRESETS = [
  { range: "today", label: "Today" },
  { range: "week", label: "This week" },
  { range: "month", label: "This month" },
] as const;
/** Words for the chosen period: the orders card title, the "no sales" line and what the % compares with. */
const PERIOD_WORDS = {
  today: { orders: "Orders today", none: "No sales today", previous: "yesterday" },
  week: { orders: "Orders this week", none: "No sales this week", previous: "last week" },
  month: { orders: "Orders this month", none: "No sales this month", previous: "last month" },
  custom: {
    orders: "Orders in this period",
    none: "No sales in this period",
    previous: "the days before",
  },
} as const;

type History = { orders: ChefOrder[]; cursor: string | null; hasMore: boolean; failed: boolean };

function Trend({ change, text }: { change: number | null; text: string }) {
  if (!change) return null;
  return (
    <p
      className={`mt-0.5 text-[0.8125rem] font-semibold ${change > 0 ? "text-[#0E6B4C]" : "text-[#C4200F]"}`}
    >
      <span aria-hidden="true">{change > 0 ? "▲" : "▼"}</span>
      <span className="sr-only">{change > 0 ? "Up" : "Down"}</span> {text}
    </p>
  );
}

/** One bar per day. A bar names its day and amount, and opens that day's orders; the last day is lit at first. */
function EarnedEachDay({
  byDay,
  caption,
  now,
  onSelect,
}: {
  byDay: EarningsSummary["byDay"];
  caption: string;
  now: number;
  onSelect(day: number): void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked !== null && picked < byDay.length ? picked : byDay.length - 1;
  const top = Math.max(...byDay.map((day) => day.amount), 1);
  return (
    <ChefSection
      title="Earned each day"
      labelledBy="chef-earned-each-day"
      action={
        <p className="shrink-0 text-[0.8125rem] text-[#6B6B6B]" aria-live="polite">
          {picked === null
            ? caption
            : `${byDay[selected].label} · ${formatInr(byDay[selected].amount)}`}
        </p>
      }
    >
      <div
        className="flex items-end gap-1"
        role="group"
        aria-label="Each day: open a day to see its orders"
      >
        {byDay.map((item, index) => (
          <button
            key={item.day}
            type="button"
            aria-label={`${istDayName(item.day, now)}, ${formatInr(item.amount)}`}
            aria-pressed={index === selected}
            onClick={() => {
              setPicked(index);
              onSelect(item.day);
            }}
            className="flex min-w-0 flex-1 flex-col items-stretch gap-1 !rounded-md !border-0 !bg-transparent !p-0 !shadow-none"
          >
            <span className="flex h-32 items-end" aria-hidden="true">
              <span
                className={`block w-full rounded-t-[4px] ${index === selected ? "bg-flame-red" : "bg-flame-red/35"}`}
                style={{ height: `${Math.max(3, (item.amount / top) * 100)}%` }}
              />
            </span>
            {byDay.length <= MAX_LABELLED_BARS ? (
              <span
                className="truncate text-center text-[0.6875rem] text-[#6B6B6B]"
                aria-hidden="true"
              >
                {item.label}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </ChefSection>
  );
}

function TopDishes({
  dishes,
  photos,
}: {
  dishes: EarningsSummary["topDishes"];
  photos: Record<string, string>;
}) {
  return (
    <ChefSection title="Top dishes" labelledBy="chef-top-dishes" flush>
      <ol className="chef-list border-t border-[#E3E6EA]">
        {dishes.map((dish, index) => (
          <li key={dish.name} className="chef-row">
            {photos[dish.menuItemId] ? (
              <img
                src={photos[dish.menuItemId]}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-12 w-12 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="chef-row-icon font-bold" aria-hidden="true">
                {index + 1}
              </span>
            )}
            <span className="chef-row-main">
              <span className="chef-row-title line-clamp-2 block">{dish.name}</span>
              <span className="chef-row-meta block">{dish.sold} sold</span>
            </span>
            {dish.amount > 0 ? (
              <span className="chef-row-value chef-amount">{formatInr(dish.amount)}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </ChefSection>
  );
}

function OrdersSplit({ title, split }: { title: string; split: EarningsSummary["split"] }) {
  const parts = [
    { key: "delivered", count: split.delivered, bar: "bg-[#17803D]", text: "text-[#1A1A1A]" },
    { key: "cancelled", count: split.cancelled, bar: "bg-[#B7791F]", text: "text-[#8A5300]" },
    { key: "rejected", count: split.rejected, bar: "bg-[#C4200F]", text: "text-[#C4200F]" },
  ];
  return (
    <ChefSection title={title} labelledBy="chef-orders-split">
      <div aria-hidden="true" className="flex h-2 gap-px overflow-hidden rounded-full bg-[#E3E6EA]">
        {parts
          .filter((part) => part.count > 0)
          .map((part) => (
            <span key={part.key} className={part.bar} style={{ flex: part.count }} />
          ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.875rem]">
        {parts.map((part) => (
          <li key={part.key} className={part.text}>
            <strong className="font-extrabold">{part.count}</strong> {part.key}
          </li>
        ))}
      </ul>
    </ChefSection>
  );
}

/** Pick the first and last day (one day alone is fine), up to today and at most 31 days. */
function DateRangeSheet({
  open,
  onClose,
  now,
  onApply,
}: {
  open: boolean;
  onClose(): void;
  now: number;
  onApply(range: { from: number; to: number }): void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const today = istInputValue(now);
  const first = istDayFromInput(from);
  const last = to ? istDayFromInput(to) : first;
  const error =
    first === null || last === null
      ? ""
      : Math.max(first, last) > istDayStart(now)
        ? "Pick days up to today."
        : Math.abs(last - first) / DAY_MS + 1 > MAX_RANGE_DAYS
          ? `Pick up to ${MAX_RANGE_DAYS} days.`
          : "";
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Pick dates"
      description={`Choose the first and last day, up to ${MAX_RANGE_DAYS} days.`}
      footer={
        <>
          <button type="button" className={secondaryActionClass} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="craves-primary-action w-full sm:w-auto"
            disabled={first === null || last === null || !!error}
            onClick={() => first !== null && last !== null && onApply({ from: first, to: last })}
          >
            Show
          </button>
        </>
      }
    >
      <div className="mt-4 grid grid-cols-2 gap-3">
        {(
          [
            ["First day", from, setFrom],
            ["Last day", to, setTo],
          ] as const
        ).map(([label, value, change]) => (
          <label key={label} className="chef-field-label">
            {label}
            <input
              type="date"
              max={today}
              value={value}
              onChange={(event) => change(event.target.value)}
              aria-invalid={!!error}
              className="mt-2 block min-h-12 w-full rounded-xl border border-[#D3D7DD] bg-white px-3 text-base font-normal text-[#1A1A1A]"
            />
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="chef-field-error mt-2">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}

/**
 * Sales for a period, above the ledger: what was earned and delivered against the period before, each day's earnings
 * (a day opens its orders), the best sellers and how orders ended. Days are India days. The ledger hands in its
 * entries; the orders are the latest ones plus older pages, read only as far back as the period before needs.
 */
export function ChefEarningsInsights({
  entries,
  loading,
  failed,
  onRetry,
}: {
  entries: ChefEarning[];
  loading: boolean;
  failed: boolean;
  onRetry(): void;
}) {
  const [range, setRange] = useState<EarningsRange>("week");
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<{ orders: ChefOrder[]; status: "loading" | "ready" | "failed" }>(
    { orders: [], status: "loading" },
  );
  const [history, setHistory] = useState<History>({
    orders: [],
    cursor: null,
    hasMore: true,
    failed: false,
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyBusy = useRef(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<{ day: number } | "dates" | null>(null);

  // "Today" and the week move on at midnight: read the clock again whenever the page comes back into view.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", wake);
    return () => document.removeEventListener("visibilitychange", wake);
  }, []);

  const loadLive = useCallback(async () => {
    setLive((current) => ({ ...current, status: "loading" }));
    try {
      const response = await sessionFetch("/api/chef/orders", { cache: "no-store" });
      const orders = response.ok
        ? parseChefOrdersResponse(await response.json().catch(() => null))
        : null;
      setLive((current) =>
        orders ? { orders, status: "ready" } : { ...current, status: "failed" },
      );
    } catch {
      setLive((current) => ({ ...current, status: "failed" }));
    }
  }, []);
  useEffect(() => {
    void loadLive();
  }, [loadLive]);
  // Dish photos are an extra: without them the top dishes show their rank.
  useEffect(() => {
    sessionFetch("/api/chef/menu", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const covers = (parseChefMenuItems(body) ?? []).flatMap((item) => {
          const url = item.images.find((image) => image.primary)?.publicUrl ?? item.images[0]?.publicUrl;
          return url ? [[item.id, url] as const] : [];
        });
        setPhotos(Object.fromEntries(covers));
      })
      .catch(() => undefined);
  }, []);

  const bounds = earningsRangeBounds(range, now);
  const previousFrom = earningsPreviousBounds(range, now).from;
  const missing = olderOrdersMissing({
    historyOrders: history.orders,
    hasMore: history.hasMore,
    from: previousFrom,
  });
  // Older orders are read a page at a time, only as far back as the period before needs, up to the cap.
  const wantMore =
    !historyLoading &&
    !history.failed &&
    history.hasMore &&
    history.orders.length < MAX_HISTORY_ORDERS &&
    (history.orders.length === 0 || missing);
  const loadOlder = useCallback(async (cursor: string | null) => {
    if (historyBusy.current) return;
    historyBusy.current = true;
    setHistoryLoading(true);
    try {
      const page = await fetchChefOrderHistoryPage({ limit: HISTORY_PAGE, cursor });
      setHistory((current) => ({
        orders: [...current.orders, ...page.orders],
        cursor: page.nextCursor,
        hasMore: page.hasMore && !!page.nextCursor,
        failed: false,
      }));
    } catch (error) {
      // A server without the older orders route just leaves the latest orders.
      const unpublished =
        error instanceof ChefOrderHistoryError && error.code === FEATURE_NOT_AVAILABLE;
      setHistory((current) =>
        unpublished ? { ...current, hasMore: false } : { ...current, failed: true },
      );
    } finally {
      historyBusy.current = false;
      setHistoryLoading(false);
    }
  }, []);
  useEffect(() => {
    if (wantMore) void loadOlder(history.cursor);
  }, [wantMore, history.cursor, loadOlder]);

  const orders = useMemo(() => {
    const latest = new Set(live.orders.map((order) => order.id));
    return [...live.orders, ...history.orders.filter((order) => !latest.has(order.id))];
  }, [live.orders, history.orders]);
  const coversFrom = (from: number) =>
    ordersCoverFrom({
      liveOrders: live.orders,
      historyOrders: history.orders,
      hasMore: history.hasMore,
      historyFailed: history.failed,
      from,
    });
  const historyIncomplete = !coversFrom(previousFrom);
  const summary = useMemo(
    () =>
      summarizeEarnings({
        orders,
        earnings: entries,
        range,
        now,
        earningsLimit: EARNINGS_LIMIT,
        ordersCutOff: historyIncomplete,
      }),
    [orders, entries, range, now, historyIncomplete],
  );

  const custom = typeof range === "object";
  const words = PERIOD_WORDS[custom ? "custom" : range];
  const period = periodText(bounds);
  const ordersFailed = live.status === "failed" && orders.length === 0;
  const oldestEntry =
    entries.length > 0 ? Math.min(...entries.map((entry) => Date.parse(entry.createdAt))) : NaN;
  const cutOff = entries.length >= EARNINGS_LIMIT && oldestEntry > bounds.from;
  const latestOnly = orders.length > 0 && !historyLoading && !wantMore && !coversFrom(bounds.from);
  const empty =
    summary.earned === 0 &&
    summary.delivered === 0 &&
    summary.split.cancelled + summary.split.rejected === 0;
  const dayOrders = sheet !== null && sheet !== "dates" ? ordersOnDay(orders, sheet.day) : [];

  return (
    <section aria-label="Sales" className="chef-stack">
      <div className="chef-chips" role="group" aria-label="Period">
        {PRESETS.map((preset) => (
          <button
            key={preset.range}
            type="button"
            className="chef-chip"
            aria-pressed={range === preset.range}
            onClick={() => setRange(preset.range)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className="chef-chip"
          aria-pressed={custom}
          onClick={() => setSheet("dates")}
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {custom ? period : "Pick dates"}
        </button>
      </div>

      {loading || live.status === "loading" ? (
        <div className="chef-stack" role="status" aria-label="Loading your sales">
          <ChefSkeleton className="h-28 w-full" />
          <ChefSkeleton className="h-52 w-full" />
        </div>
      ) : failed || ordersFailed ? (
        <ChefSection>
          <ChefEmpty
            icon={AlertTriangle}
            title={failed ? "We couldn’t load your earnings." : "We couldn’t load your orders."}
            text="Check your connection and try again."
            action={
              <button
                type="button"
                className="chef-btn"
                onClick={() => (failed ? onRetry() : void loadLive())}
              >
                Try again
              </button>
            }
          />
        </ChefSection>
      ) : (
        <>
          <ChefSection flush>
            <div className="chef-stats is-three">
              <div className="chef-stat">
                <p className="chef-stat-label">You earned</p>
                <p className="chef-stat-value chef-amount">{formatInr(summary.earned)}</p>
                <Trend
                  change={summary.changeVsPrevious}
                  text={`${Math.abs(summary.changeVsPrevious ?? 0)}% vs ${words.previous}`}
                />
              </div>
              <div className="chef-stat">
                <p className="chef-stat-label">Orders delivered</p>
                <p className="chef-stat-value">{summary.delivered}</p>
                <Trend
                  change={summary.deliveredChange}
                  text={`${Math.abs(summary.deliveredChange ?? 0)} vs ${words.previous}`}
                />
              </div>
              <div className="chef-stat">
                <p className="chef-stat-label">Average order</p>
                <p className="chef-stat-value chef-amount">{formatInr(summary.averageOrder)}</p>
              </div>
            </div>
          </ChefSection>
          <div className="text-[0.8125rem] text-[#6B6B6B]" aria-live="polite">
            {cutOff ? <p>Based on your latest {EARNINGS_LIMIT} earnings.</p> : null}
            {history.failed ? (
              <p>
                Couldn’t load older orders.{" "}
                <button
                  type="button"
                  className="!border-0 !bg-transparent !p-0 font-bold text-[#C4200F] underline"
                  onClick={() => setHistory((current) => ({ ...current, failed: false }))}
                >
                  Try again
                </button>
              </p>
            ) : missing && history.orders.length >= MAX_HISTORY_ORDERS ? (
              <p>Showing your latest {MAX_HISTORY_ORDERS} orders.</p>
            ) : latestOnly ? (
              <p>Showing your latest orders only.</p>
            ) : null}
          </div>

          {empty ? (
            <ChefSection>
              <ChefEmpty
                icon={BadgeIndianRupee}
                title={entries.length === 0 && orders.length === 0 ? "No sales yet" : words.none}
                text="Your earnings, best sellers and daily sales show up here once orders are delivered."
                action={
                  entries.length === 0 && orders.length === 0 ? (
                    <Link href="/chef/menu" className="chef-btn">
                      Go to your menu
                    </Link>
                  ) : undefined
                }
              />
            </ChefSection>
          ) : (
            <>
              {summary.byDay.length > 1 ? (
                <EarnedEachDay
                  key={`${bounds.from}-${bounds.to}`}
                  byDay={summary.byDay}
                  caption={period}
                  now={now}
                  onSelect={(day) => setSheet({ day })}
                />
              ) : null}
              {summary.topDishes.length > 0 ? (
                <TopDishes dishes={summary.topDishes} photos={photos} />
              ) : null}
              <OrdersSplit title={words.orders} split={summary.split} />
            </>
          )}
        </>
      )}

      <Sheet
        open={sheet !== null && sheet !== "dates"}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
        title={
          sheet !== null && sheet !== "dates" ? `Orders · ${istDayName(sheet.day, now)}` : "Orders"
        }
      >
        {dayOrders.length === 0 ? (
          <p className="mt-4 text-[0.9375rem] text-[#6B6B6B]">No orders this day.</p>
        ) : (
          <ul className="chef-list mt-4 overflow-hidden rounded-xl border border-[#E3E6EA]">
            {dayOrders.map((order) => {
              const state = chefOrderStatus(order.status);
              const title = [`#${shortOrderNumber(order.id)}`, order.deliveryAddress?.recipientName]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={order.id}>
                  <Link href={`/chef/orders/${order.id}`} className="chef-row">
                    <span className="chef-row-main">
                      <span className="chef-row-title block">{title}</span>
                      <span className="chef-row-meta block chef-amount">
                        {formatInr(order.foodSubtotal, { currency: order.currency })}
                      </span>
                    </span>
                    <ChefPill tone={state.tone}>{state.label}</ChefPill>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
      <DateRangeSheet
        open={sheet === "dates"}
        now={now}
        onClose={() => setSheet(null)}
        onApply={(picked) => {
          setRange(picked);
          setSheet(null);
        }}
      />
    </section>
  );
}
