"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
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
import { format, messages, type Language } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { secondaryActionClass, Sheet } from "@/shared/ui/overlays/overlay";

/** The earnings read's limit (src/app/api/chef/earnings): a list this long may be missing its oldest entries. */
const EARNINGS_LIMIT = 200;
const HISTORY_PAGE = 50;
// A week of bars fits a phone; a longer range scrolls sideways with finger-sized bars.
const BARS_THAT_FIT = 7;
const PRESETS = ["today", "week", "month"] as const;

const TEXT = messages({
  en: {
    today: "Today", week: "This week", month: "This month", pickDates: "Pick dates", up: "Up", down: "Down",
    earnedEachDay: "Earned each day", eachDay: "Each day: open a day to see its orders", topDishes: "Top dishes", sold: "{count} sold",
    delivered: "delivered", cancelled: "cancelled", rejected: "rejected",
    pickToday: "Pick days up to today.", pickUpTo: "Pick up to {count} days.", pickDescription: "Choose the first and last day, up to {count} days.",
    cancel: "Cancel", show: "Show", firstDay: "First day", lastDay: "Last day",
    sales: "Sales", period: "Period", loading: "Loading your sales",
    earningsFailed: "We couldn’t load your earnings.", ordersFailed: "We couldn’t load your orders.", checkConnection: "Check your connection and try again.", tryAgain: "Try again",
    youEarned: "You earned", trendMoney: "{value}% vs {previous}", trendCount: "{value} vs {previous}", ordersDelivered: "Orders delivered", averageOrder: "Average order",
    latestEarnings: "Based on your latest {count} earnings.", olderFailed: "Couldn’t load older orders.",
    latestOrders: "Showing your latest {count} orders.", latestOnly: "Showing your latest orders only.",
    noSales: "No sales yet", emptyText: "Your earnings, best sellers and daily sales show up here once orders are delivered.", goToMenu: "Go to your menu",
    orders: "Orders", ordersOn: "Orders · {day}", noOrdersDay: "No orders this day.",
  },
  te: {
    today: "ఈరోజు", week: "ఈ వారం", month: "ఈ నెల", pickDates: "తేదీలు ఎంచుకోండి", up: "పెరిగింది", down: "తగ్గింది",
    earnedEachDay: "ప్రతి రోజు సంపాదన", eachDay: "ప్రతి రోజు: ఆ రోజు ఆర్డర్లు చూడడానికి నొక్కండి", topDishes: "ఎక్కువగా అమ్ముడైన వంటకాలు", sold: "{count} అమ్ముడయ్యాయి",
    delivered: "డెలివరీ అయ్యాయి", cancelled: "రద్దయ్యాయి", rejected: "తిరస్కరించారు",
    pickToday: "ఈరోజు వరకు ఉన్న రోజులే ఎంచుకోండి.", pickUpTo: "{count} రోజుల వరకు మాత్రమే ఎంచుకోండి.", pickDescription: "మొదటి, చివరి రోజు ఎంచుకోండి — {count} రోజుల వరకు.",
    cancel: "రద్దు చేయండి", show: "చూపించండి", firstDay: "మొదటి రోజు", lastDay: "చివరి రోజు",
    sales: "అమ్మకాలు", period: "ఏ రోజులు", loading: "మీ అమ్మకాలు లోడ్ అవుతున్నాయి",
    earningsFailed: "మీ సంపాదన లోడ్ కాలేదు.", ordersFailed: "మీ ఆర్డర్లు లోడ్ కాలేదు.", checkConnection: "ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.", tryAgain: "మళ్లీ ప్రయత్నించండి",
    youEarned: "మీరు సంపాదించింది", trendMoney: "{previous} {value}%", trendCount: "{previous} {value}", ordersDelivered: "డెలివరీ అయిన ఆర్డర్లు", averageOrder: "సగటు ఆర్డర్",
    latestEarnings: "మీ తాజా {count} సంపాదనల ఆధారంగా.", olderFailed: "పాత ఆర్డర్లు లోడ్ కాలేదు.",
    latestOrders: "మీ తాజా {count} ఆర్డర్లు చూపిస్తున్నాం.", latestOnly: "మీ తాజా ఆర్డర్లు మాత్రమే చూపిస్తున్నాం.",
    noSales: "ఇంకా అమ్మకాలు లేవు", emptyText: "ఆర్డర్లు డెలివరీ అయిన తర్వాత మీ సంపాదన, ఎక్కువగా అమ్ముడైనవి, రోజువారీ అమ్మకాలు ఇక్కడ కనిపిస్తాయి.", goToMenu: "మీ మెనూకి వెళ్లండి",
    orders: "ఆర్డర్లు", ordersOn: "ఆర్డర్లు · {day}", noOrdersDay: "ఆ రోజు ఆర్డర్లు లేవు.",
  },
  kn: {
    today: "ಇಂದು", week: "ಈ ವಾರ", month: "ಈ ತಿಂಗಳು", pickDates: "ದಿನಾಂಕ ಆಯ್ಕೆಮಾಡಿ", up: "ಏರಿಕೆ", down: "ಇಳಿಕೆ",
    earnedEachDay: "ಪ್ರತಿ ದಿನದ ಗಳಿಕೆ", eachDay: "ಪ್ರತಿ ದಿನ: ಆ ದಿನದ ಆರ್ಡರ್ ನೋಡಲು ಒತ್ತಿ", topDishes: "ಹೆಚ್ಚು ಮಾರಾಟವಾದ ಖಾದ್ಯಗಳು", sold: "{count} ಮಾರಾಟವಾಗಿವೆ",
    delivered: "ಡೆಲಿವರಿ ಆಗಿದೆ", cancelled: "ರದ್ದಾಗಿದೆ", rejected: "ತಿರಸ್ಕರಿಸಲಾಗಿದೆ",
    pickToday: "ಇಂದಿನವರೆಗಿನ ದಿನಗಳನ್ನು ಮಾತ್ರ ಆಯ್ಕೆಮಾಡಿ.", pickUpTo: "ಗರಿಷ್ಠ {count} ದಿನಗಳನ್ನು ಆಯ್ಕೆಮಾಡಿ.", pickDescription: "ಮೊದಲ ಮತ್ತು ಕೊನೆಯ ದಿನ ಆಯ್ಕೆಮಾಡಿ — ಗರಿಷ್ಠ {count} ದಿನಗಳು.",
    cancel: "ರದ್ದುಮಾಡಿ", show: "ತೋರಿಸಿ", firstDay: "ಮೊದಲ ದಿನ", lastDay: "ಕೊನೆಯ ದಿನ",
    sales: "ಮಾರಾಟ", period: "ಯಾವ ದಿನಗಳು", loading: "ನಿಮ್ಮ ಮಾರಾಟ ಲೋಡ್ ಆಗುತ್ತಿದೆ",
    earningsFailed: "ನಿಮ್ಮ ಗಳಿಕೆ ಲೋಡ್ ಆಗಲಿಲ್ಲ.", ordersFailed: "ನಿಮ್ಮ ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ.", checkConnection: "ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    youEarned: "ನೀವು ಗಳಿಸಿದ್ದು", trendMoney: "{previous} {value}%", trendCount: "{previous} {value}", ordersDelivered: "ಡೆಲಿವರಿ ಆದ ಆರ್ಡರ್‌ಗಳು", averageOrder: "ಸರಾಸರಿ ಆರ್ಡರ್",
    latestEarnings: "ನಿಮ್ಮ ಇತ್ತೀಚಿನ {count} ಗಳಿಕೆಗಳ ಆಧಾರದ ಮೇಲೆ.", olderFailed: "ಹಳೆಯ ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ.",
    latestOrders: "ನಿಮ್ಮ ಇತ್ತೀಚಿನ {count} ಆರ್ಡರ್‌ಗಳನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ.", latestOnly: "ನಿಮ್ಮ ಇತ್ತೀಚಿನ ಆರ್ಡರ್‌ಗಳನ್ನು ಮಾತ್ರ ತೋರಿಸಲಾಗುತ್ತಿದೆ.",
    noSales: "ಇನ್ನೂ ಮಾರಾಟ ಇಲ್ಲ", emptyText: "ಆರ್ಡರ್‌ಗಳು ಡೆಲಿವರಿ ಆದ ನಂತರ ನಿಮ್ಮ ಗಳಿಕೆ, ಹೆಚ್ಚು ಮಾರಾಟವಾದವು ಮತ್ತು ದಿನದ ಮಾರಾಟ ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.", goToMenu: "ನಿಮ್ಮ ಮೆನುಗೆ ಹೋಗಿ",
    orders: "ಆರ್ಡರ್‌ಗಳು", ordersOn: "ಆರ್ಡರ್‌ಗಳು · {day}", noOrdersDay: "ಆ ದಿನ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ.",
  },
});

type PeriodWords = { orders: string; none: string; previous: string };
/**
 * Words for the chosen period: the orders card title, the "no sales" line and what the % compares with.
 * Telugu and Kannada put the comparison first ("గత వారం కంటే 50%"), so `previous` carries its own "than".
 */
const PERIOD_WORDS: Record<Language, Record<"today" | "week" | "month" | "custom", PeriodWords>> = {
  en: {
    today: { orders: "Orders today", none: "No sales today", previous: "yesterday" },
    week: { orders: "Orders this week", none: "No sales this week", previous: "last week" },
    month: { orders: "Orders this month", none: "No sales this month", previous: "last month" },
    custom: { orders: "Orders in this period", none: "No sales in this period", previous: "the days before" },
  },
  te: {
    today: { orders: "ఈరోజు ఆర్డర్లు", none: "ఈరోజు అమ్మకాలు లేవు", previous: "నిన్నటి కంటే" },
    week: { orders: "ఈ వారం ఆర్డర్లు", none: "ఈ వారం అమ్మకాలు లేవు", previous: "గత వారం కంటే" },
    month: { orders: "ఈ నెల ఆర్డర్లు", none: "ఈ నెల అమ్మకాలు లేవు", previous: "గత నెల కంటే" },
    custom: { orders: "ఈ రోజుల్లో ఆర్డర్లు", none: "ఈ రోజుల్లో అమ్మకాలు లేవు", previous: "ముందు రోజుల కంటే" },
  },
  kn: {
    today: { orders: "ಇಂದಿನ ಆರ್ಡರ್‌ಗಳು", none: "ಇಂದು ಮಾರಾಟ ಇಲ್ಲ", previous: "ನಿನ್ನೆಗಿಂತ" },
    week: { orders: "ಈ ವಾರದ ಆರ್ಡರ್‌ಗಳು", none: "ಈ ವಾರ ಮಾರಾಟ ಇಲ್ಲ", previous: "ಕಳೆದ ವಾರಕ್ಕಿಂತ" },
    month: { orders: "ಈ ತಿಂಗಳ ಆರ್ಡರ್‌ಗಳು", none: "ಈ ತಿಂಗಳು ಮಾರಾಟ ಇಲ್ಲ", previous: "ಕಳೆದ ತಿಂಗಳಿಗಿಂತ" },
    custom: { orders: "ಈ ದಿನಗಳ ಆರ್ಡರ್‌ಗಳು", none: "ಈ ದಿನಗಳಲ್ಲಿ ಮಾರಾಟ ಇಲ್ಲ", previous: "ಹಿಂದಿನ ದಿನಗಳಿಗಿಂತ" },
  },
};

type History = { orders: ChefOrder[]; cursor: string | null; hasMore: boolean; failed: boolean };

function Trend({ change, label }: { change: number | null; label: string }) {
  const text = useText(TEXT);
  if (!change) return null;
  return (
    <p
      className={`mt-0.5 text-[0.8125rem] font-semibold ${change > 0 ? "text-[#0E6B4C]" : "text-[#C4200F]"}`}
    >
      <span aria-hidden="true">{change > 0 ? "▲" : "▼"}</span>
      <span className="sr-only">{change > 0 ? text.up : text.down}</span> {label}
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
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked !== null && picked < byDay.length ? picked : byDay.length - 1;
  const top = Math.max(...byDay.map((day) => day.amount), 1);
  const scrolls = byDay.length > BARS_THAT_FIT;
  const row = useRef<HTMLDivElement>(null);
  // Open on the latest day, at the right end of a scrolling row.
  useEffect(() => {
    if (scrolls && row.current) row.current.scrollLeft = row.current.scrollWidth;
  }, [scrolls, byDay.length]);
  return (
    <ChefSection
      title={text.earnedEachDay}
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
        ref={row}
        className={`flex items-end gap-1${scrolls ? " overflow-x-auto pb-1" : ""}`}
        role="group"
        aria-label={text.eachDay}
      >
        {byDay.map((item, index) => (
          <button
            key={item.day}
            type="button"
            aria-label={`${istDayName(item.day, now, language)}, ${formatInr(item.amount)}`}
            aria-pressed={index === selected}
            onClick={() => {
              setPicked(index);
              onSelect(item.day);
            }}
            // A week drops the site-wide 3rem button minimum to fit a phone; a scrolling row keeps it for the finger.
            className={`flex ${scrolls ? "" : "!min-w-0 "}flex-1 flex-col items-stretch gap-1 !rounded-md !border-0 !bg-transparent !p-0 !shadow-none`}
          >
            <span className="flex h-32 items-end" aria-hidden="true">
              <span
                // Explicit colours: the flame-red theme token isn't in the Tailwind build, so bg-flame-red drew nothing.
                // Other days are grey, not faded red (no pink tint in chef screens).
                className={`block w-full rounded-t-[4px] ${index === selected ? "bg-[#F62E18]" : "bg-[#D0D5DB]"}`}
                style={{ height: `${Math.max(3, (item.amount / top) * 100)}%` }}
              />
            </span>
            <span className="truncate text-center text-[0.6875rem] text-[#6B6B6B]" aria-hidden="true">
              {item.label}
            </span>
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
  const text = useText(TEXT);
  return (
    <ChefSection title={text.topDishes} labelledBy="chef-top-dishes" flush>
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
              <span className="chef-row-meta block">{format(text.sold, { count: dish.sold })}</span>
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
  const words = useText(TEXT);
  const parts = [
    { key: "delivered", count: split.delivered, bar: "bg-[#17803D]", text: "text-[#1A1A1A]" },
    { key: "cancelled", count: split.cancelled, bar: "bg-[#B7791F]", text: "text-[#8A5300]" },
    { key: "rejected", count: split.rejected, bar: "bg-[#C4200F]", text: "text-[#C4200F]" },
  ] as const;
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
            <strong className="font-extrabold">{part.count}</strong> {words[part.key]}
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
  const text = useText(TEXT);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const today = istInputValue(now);
  const first = istDayFromInput(from);
  const last = to ? istDayFromInput(to) : first;
  const error =
    first === null || last === null
      ? ""
      : Math.max(first, last) > istDayStart(now)
        ? text.pickToday
        : Math.abs(last - first) / DAY_MS + 1 > MAX_RANGE_DAYS
          ? format(text.pickUpTo, { count: MAX_RANGE_DAYS })
          : "";
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={text.pickDates}
      description={format(text.pickDescription, { count: MAX_RANGE_DAYS })}
      footer={
        <>
          <button type="button" className={secondaryActionClass} onClick={onClose}>
            {text.cancel}
          </button>
          <button
            type="button"
            className="craves-primary-action w-full sm:w-auto"
            disabled={first === null || last === null || !!error}
            onClick={() => first !== null && last !== null && onApply({ from: first, to: last })}
          >
            {text.show}
          </button>
        </>
      }
    >
      {/* Sheets open outside the chef page: the theme brings the chef colours along. */}
      <div className="chef-panel-theme chef-sheet-theme">
      <div className="mt-4 grid grid-cols-2 gap-3">
        {(
          [
            [text.firstDay, from, setFrom],
            [text.lastDay, to, setTo],
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
      </div>
    </Sheet>
  );
}

/**
 * Sales for a period, on the Earnings tab: what was earned and delivered against the period before, each day's earnings
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
  const text = useText(TEXT);
  const { language } = useLanguage();
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
        language,
      }),
    [orders, entries, range, now, historyIncomplete, language],
  );

  const custom = typeof range === "object";
  const words = PERIOD_WORDS[language][custom ? "custom" : range];
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
    <section aria-label={text.sales} className="chef-stack">
      <div className="chef-chips" role="group" aria-label={text.period}>
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="chef-chip"
            aria-pressed={range === preset}
            onClick={() => setRange(preset)}
          >
            {text[preset]}
          </button>
        ))}
        <button
          type="button"
          className="chef-chip"
          aria-pressed={custom}
          onClick={() => setSheet("dates")}
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {custom ? period : text.pickDates}
        </button>
      </div>

      {loading || live.status === "loading" ? (
        <div className="chef-stack" role="status" aria-label={text.loading}>
          <ChefSkeleton className="h-28 w-full" />
          <ChefSkeleton className="h-52 w-full" />
        </div>
      ) : failed || ordersFailed ? (
        <ChefSection>
          <ChefEmpty
            illustration="loadError"
            title={failed ? text.earningsFailed : text.ordersFailed}
            text={text.checkConnection}
            action={
              <button
                type="button"
                className="chef-btn"
                onClick={() => (failed ? onRetry() : void loadLive())}
              >
                {text.tryAgain}
              </button>
            }
          />
        </ChefSection>
      ) : (
        <>
          <ChefSection flush>
            <div className="chef-stats is-three">
              <div className="chef-stat">
                <p className="chef-stat-label">{text.youEarned}</p>
                <p className="chef-stat-value chef-amount">{formatInr(summary.earned)}</p>
                <Trend
                  change={summary.changeVsPrevious}
                  label={format(text.trendMoney, { value: Math.abs(summary.changeVsPrevious ?? 0), previous: words.previous })}
                />
              </div>
              <div className="chef-stat">
                <p className="chef-stat-label">{text.ordersDelivered}</p>
                <p className="chef-stat-value">{summary.delivered}</p>
                <Trend
                  change={summary.deliveredChange}
                  label={format(text.trendCount, { value: Math.abs(summary.deliveredChange ?? 0), previous: words.previous })}
                />
              </div>
              <div className="chef-stat">
                <p className="chef-stat-label">{text.averageOrder}</p>
                <p className="chef-stat-value chef-amount">{formatInr(summary.averageOrder)}</p>
              </div>
            </div>
          </ChefSection>
          <div className="text-[0.8125rem] text-[#6B6B6B]" aria-live="polite">
            {cutOff ? <p>{format(text.latestEarnings, { count: EARNINGS_LIMIT })}</p> : null}
            {history.failed ? (
              <p>
                {text.olderFailed}{" "}
                <button
                  type="button"
                  className="!border-0 !bg-transparent !p-0 font-bold text-[#C4200F] underline"
                  onClick={() => setHistory((current) => ({ ...current, failed: false }))}
                >
                  {text.tryAgain}
                </button>
              </p>
            ) : missing && history.orders.length >= MAX_HISTORY_ORDERS ? (
              <p>{format(text.latestOrders, { count: MAX_HISTORY_ORDERS })}</p>
            ) : latestOnly ? (
              <p>{text.latestOnly}</p>
            ) : null}
          </div>

          {empty ? (
            <ChefSection>
              <ChefEmpty
                illustration="earnings"
                title={entries.length === 0 && orders.length === 0 ? text.noSales : words.none}
                text={text.emptyText}
                action={
                  entries.length === 0 && orders.length === 0 ? (
                    <Link href="/chef/menu" className="chef-btn">
                      {text.goToMenu}
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
          sheet !== null && sheet !== "dates" ? format(text.ordersOn, { day: istDayName(sheet.day, now, language) }) : text.orders
        }
      >
        {dayOrders.length === 0 ? (
          <p className="mt-4 text-[0.9375rem] text-[#6B6B6B]">{text.noOrdersDay}</p>
        ) : (
          <ul className="chef-panel-theme chef-sheet-theme chef-list mt-4 overflow-hidden rounded-xl border border-[#E3E6EA]">
            {dayOrders.map((order) => {
              const state = chefOrderStatus(order.status, language);
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
