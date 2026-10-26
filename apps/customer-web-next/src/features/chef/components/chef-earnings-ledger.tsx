"use client";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import {
  parseChefEarnings,
  type ChefEarning,
  type ChefEarningStatus,
} from "@/features/chef/lib/chef-earnings-contract";
import {
  ChefEmpty,
  ChefNotice,
  ChefPill,
  ChefSection,
  ChefSkeleton,
  dateTime,
  formatInr,
  type ChefTone,
} from "@/features/chef/components/chef-ui";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { ChefSkeletonRow } from "@/features/chef/components/chef-loading";
import { ChefEarningsInsights } from "@/features/chef/components/chef-earnings-insights";
import { format, messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

type LedgerView = "ALL" | ChefEarningStatus;

const TEXT = messages({
  en: {
    loadFailed: "We couldn’t load your earnings. Try again.",
    unreadable: CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE,
    all: "All",
    earned: "Earned in all",
    coming: "Coming to your bank",
    paid: "Paid to your bank",
    note: "These add up the orders below. Refunds and other changes are counted in Balance & payouts, where you take out your money.",
    title: "Money from each order",
    refresh: "Refresh",
    filter: "Filter earnings",
    failedTitle: "Earnings couldn’t load",
    tryAgain: "Try again",
    emptyTitle: "No earnings yet",
    emptyText: "Money from an order shows here after the customer gets their food.",
    nothing: "Nothing here",
    nothingText: "Tap All to see every order.",
    order: "Order #{number}",
    mealPlan: "Meal plan",
    orderValue: "Order value",
    serviceFee: "Craves service fee",
    tax: "Tax withheld",
    adjustment: "Adjustment",
    yourEarning: "Your earning",
    reference: "Reference {reference} · Updated {updated}",
    updated: "Updated {time}",
  },
  te: {
    loadFailed: "మీ సంపాదన లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.",
    unreadable: "Craves నుండి వచ్చిన జవాబును ఈ స్క్రీన్ చదవలేకపోయింది. పేజీని మళ్లీ లోడ్ చేయండి; ఇలాగే జరుగుతుంటే Craves సపోర్ట్‌ను సంప్రదించండి.",
    all: "అన్నీ",
    earned: "మొత్తం సంపాదన",
    coming: "మీ బ్యాంక్‌కు రాబోతోంది",
    paid: "మీ బ్యాంక్‌కు చెల్లించినది",
    note: "ఇవి కింద ఉన్న ఆర్డర్ల మొత్తాలు. రీఫండ్‌లు, ఇతర మార్పులు 'మీ డబ్బు, చెల్లింపులు' పేజీలో లెక్కిస్తారు — అక్కడే మీరు డబ్బు తీసుకుంటారు.",
    title: "ప్రతి ఆర్డర్ డబ్బు",
    refresh: "మళ్లీ చూడండి",
    filter: "ఏ ఆర్డర్లు చూపించాలి",
    failedTitle: "సంపాదన లోడ్ కాలేదు",
    tryAgain: "మళ్లీ ప్రయత్నించండి",
    emptyTitle: "ఇంకా సంపాదన లేదు",
    emptyText: "కస్టమర్‌కు ఆహారం అందిన తర్వాత ఆ ఆర్డర్ డబ్బు ఇక్కడ కనిపిస్తుంది.",
    nothing: "ఇక్కడ ఏమీ లేదు",
    nothingText: "అన్ని ఆర్డర్లు చూడడానికి 'అన్నీ' నొక్కండి.",
    order: "ఆర్డర్ #{number}",
    mealPlan: "మీల్ ప్లాన్",
    orderValue: "ఆర్డర్ విలువ",
    serviceFee: "Craves సర్వీస్ ఫీజు",
    tax: "పన్ను కోత",
    adjustment: "సర్దుబాటు",
    yourEarning: "మీ సంపాదన",
    reference: "రిఫరెన్స్ {reference} · అప్‌డేట్: {updated}",
    updated: "అప్‌డేట్: {time}",
  },
  kn: {
    loadFailed: "ನಿಮ್ಮ ಗಳಿಕೆ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    unreadable: "Craves ನಿಂದ ಬಂದ ಉತ್ತರವನ್ನು ಈ ಸ್ಕ್ರೀನ್ ಓದಲು ಆಗಲಿಲ್ಲ. ಪುಟವನ್ನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ; ಹೀಗೇ ಆಗುತ್ತಿದ್ದರೆ Craves ಸಪೋರ್ಟ್ ಅನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    all: "ಎಲ್ಲಾ",
    earned: "ಒಟ್ಟು ಗಳಿಕೆ",
    coming: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಬರಲಿದೆ",
    paid: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಪಾವತಿಸಿದ್ದು",
    note: "ಇವು ಕೆಳಗಿನ ಆರ್ಡರ್‌ಗಳ ಮೊತ್ತ. ರೀಫಂಡ್ ಮತ್ತು ಇತರ ಬದಲಾವಣೆಗಳನ್ನು 'ನಿಮ್ಮ ಹಣ, ಪಾವತಿಗಳು' ಪುಟದಲ್ಲಿ ಲೆಕ್ಕ ಹಾಕಲಾಗುತ್ತದೆ — ಅಲ್ಲೇ ನೀವು ಹಣ ತೆಗೆದುಕೊಳ್ಳುತ್ತೀರಿ.",
    title: "ಪ್ರತಿ ಆರ್ಡರ್‌ನ ಹಣ",
    refresh: "ಮತ್ತೆ ನೋಡಿ",
    filter: "ಯಾವ ಆರ್ಡರ್ ತೋರಿಸಬೇಕು",
    failedTitle: "ಗಳಿಕೆ ಲೋಡ್ ಆಗಲಿಲ್ಲ",
    tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    emptyTitle: "ಇನ್ನೂ ಗಳಿಕೆ ಇಲ್ಲ",
    emptyText: "ಗ್ರಾಹಕರಿಗೆ ಆಹಾರ ಸಿಕ್ಕ ನಂತರ ಆ ಆರ್ಡರ್‌ನ ಹಣ ಇಲ್ಲಿ ಕಾಣುತ್ತದೆ.",
    nothing: "ಇಲ್ಲಿ ಏನೂ ಇಲ್ಲ",
    nothingText: "ಎಲ್ಲಾ ಆರ್ಡರ್ ನೋಡಲು 'ಎಲ್ಲಾ' ಒತ್ತಿ.",
    order: "ಆರ್ಡರ್ #{number}",
    mealPlan: "ಮೀಲ್ ಪ್ಲಾನ್",
    orderValue: "ಆರ್ಡರ್ ಮೌಲ್ಯ",
    serviceFee: "Craves ಸೇವಾ ಶುಲ್ಕ",
    tax: "ತೆರಿಗೆ ಕಡಿತ",
    adjustment: "ಹೊಂದಾಣಿಕೆ",
    yourEarning: "ನಿಮ್ಮ ಗಳಿಕೆ",
    reference: "ರೆಫರೆನ್ಸ್ {reference} · ಅಪ್‌ಡೇಟ್: {updated}",
    updated: "ಅಪ್‌ಡೇಟ್: {time}",
  },
});

const STATUS_LABEL = messages({
  en: { DRAFT: "Being added", APPROVED: "Confirmed", SETTLEMENT_PENDING: "Coming to bank", SETTLED: "Paid to bank", REVERSED: "Taken back" },
  te: { DRAFT: "జోడిస్తున్నాం", APPROVED: "ఖరారైంది", SETTLEMENT_PENDING: "బ్యాంక్‌కు వస్తోంది", SETTLED: "బ్యాంక్‌కు చెల్లించాం", REVERSED: "తిరిగి తీసుకున్నాం" },
  kn: { DRAFT: "ಸೇರಿಸಲಾಗುತ್ತಿದೆ", APPROVED: "ಖಚಿತವಾಗಿದೆ", SETTLEMENT_PENDING: "ಬ್ಯಾಂಕ್‌ಗೆ ಬರಲಿದೆ", SETTLED: "ಬ್ಯಾಂಕ್‌ಗೆ ಪಾವತಿಸಲಾಗಿದೆ", REVERSED: "ಹಿಂಪಡೆಯಲಾಗಿದೆ" },
});

/**
 * The chef's earnings entries. `sales` (the Money tab) shows only the sales for a period; without it, the totals
 * and the money from each order (/chef/earnings/orders).
 */
export function ChefEarningsLedger({ sales = false }: { sales?: boolean }) {
  const text = useText(TEXT);
  const statusLabel = useText(STATUS_LABEL);
  const [entries, setEntries] = useState<ChefEarning[]>([]);
  const [view, setView] = useState<LedgerView>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await sessionFetch("/api/chef/earnings", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) throw chefApiError(response, raw, text.loadFailed);
      const parsed = parseChefEarnings(raw);
      if (!parsed) throw new ChefError(text.unreadable, "INVALID_CHEF_EARNINGS_RESPONSE", response.status);
      setEntries(
        [...parsed].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
      );
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(
        chefErrorText(caught, text.loadFailed),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [text]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleEntries = useMemo(
    () =>
      view === "ALL"
        ? entries
        : entries.filter((entry) => entry.status === view),
    [entries, view],
  );

  if (sales)
    return <ChefEarningsInsights entries={entries} loading={loading} failed={!!error && entries.length === 0} onRetry={() => void load()} />;

  const currency = entries[0]?.currency ?? "INR";
  const approvedPayable = entries
    .filter((entry) =>
      ["APPROVED", "SETTLEMENT_PENDING", "SETTLED"].includes(entry.status),
    )
    .reduce((sum, entry) => sum + entry.netPayable, 0);
  const settledPayable = entries
    .filter((entry) => entry.status === "SETTLED")
    .reduce((sum, entry) => sum + entry.netPayable, 0);
  const pendingPayable = entries
    .filter((entry) => entry.status === "SETTLEMENT_PENDING")
    .reduce((sum, entry) => sum + entry.netPayable, 0);

  const filters: { value: LedgerView; label: string }[] = [
    { value: "ALL", label: text.all },
    { value: "SETTLEMENT_PENDING", label: statusLabel.SETTLEMENT_PENDING },
    { value: "SETTLED", label: statusLabel.SETTLED },
    { value: "APPROVED", label: statusLabel.APPROVED },
    { value: "DRAFT", label: statusLabel.DRAFT },
    { value: "REVERSED", label: statusLabel.REVERSED },
  ];

  return (
    <div className="chef-stack">
      <ChefSection flush>
        <div className="chef-stats is-three" aria-busy={loading}>
          {(
            [
              [text.earned, approvedPayable],
              [text.coming, pendingPayable],
              [text.paid, settledPayable],
            ] as const
          ).map(([label, amount]) => (
            <div key={label} className="chef-stat">
              <p className="chef-stat-label">{label}</p>
              {loading ? (
                <ChefSkeleton className="mt-1.5 h-6 w-24 !rounded-md" />
              ) : (
                <p className="chef-stat-value">{formatInr(amount, { currency })}</p>
              )}
            </div>
          ))}
        </div>
        <p className="border-t border-[#E3E6EA] px-4 py-3 text-[0.8125rem] leading-5 text-[#6B6B6B] md:px-5">
          {text.note}
        </p>
      </ChefSection>

      <ChefSection
        title={text.title}
        flush
        labelledBy="chef-earnings-list"
        action={
          <button type="button" disabled={refreshing || loading} onClick={() => void load(true)} className="chef-btn is-small" aria-busy={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            {text.refresh}
          </button>
        }
      >
        <div className="chef-chips px-4 md:px-5" role="group" aria-label={text.filter}>
          {filters.map((filter) => (
            <button key={filter.value} type="button" onClick={() => setView(filter.value)} aria-pressed={view === filter.value} className="chef-chip min-h-[40px]">
              {filter.label}
            </button>
          ))}
        </div>

        {loading ? (
          // Shaped like the rows below: order and date on the left, the amount on the right.
          <div className="chef-list mt-3 border-t border-[#E3E6EA]" aria-busy="true">
            {[0, 1, 2, 3].map((row) => (
              <ChefSkeletonRow key={row} media="none" trailing="value" />
            ))}
          </div>
        ) : error && entries.length === 0 ? (
          <ChefEmpty
            illustration="loadError"
            title={text.failedTitle}
            text={error}
            action={<button type="button" onClick={() => void load()} className="chef-btn is-primary">{text.tryAgain}</button>}
          />
        ) : entries.length === 0 ? (
          <ChefEmpty
            illustration="earnings"
            title={text.emptyTitle}
            text={text.emptyText}
          />
        ) : visibleEntries.length === 0 ? (
          <ChefEmpty illustration="search" title={text.nothing} text={text.nothingText} />
        ) : (
          <ul className="chef-list mt-3 border-t border-[#E3E6EA]">
            {visibleEntries.map((entry) => (
              <li key={entry.id}>
                <details className="group">
                  <summary className="chef-row cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <span className="chef-row-main">
                      <span className="chef-row-title block">{format(text.order, { number: shortOrderNumber(entry.orderId) })}{entry.orderSource === "SUBSCRIPTION" ? ` · ${text.mealPlan}` : ""}</span>
                      <span className="chef-row-meta flex flex-wrap items-center gap-2">
                        {dateTime(entry.createdAt)}
                        <ChefPill tone={STATUS_TONE[entry.status]}>{statusLabel[entry.status]}</ChefPill>
                      </span>
                    </span>
                    <span className={`chef-row-value chef-amount ${entry.status === "REVERSED" ? "text-[#6B6B6B] line-through" : ""}`}>{formatInr(entry.netPayable, { currency: entry.currency })}</span>
                    <ChevronDown className="chef-chevron h-5 w-5 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <dl className="grid gap-2 bg-[#F7F8FA] px-4 py-3 text-[0.875rem] md:px-5">
                    <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">{text.orderValue}</dt><dd className="chef-amount font-semibold">{formatInr(entry.grossAmount, { currency: entry.currency })}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">{text.serviceFee}</dt><dd className="chef-amount font-semibold">−{formatInr(entry.commissionAmount, { currency: entry.currency })}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">{text.tax}</dt><dd className="chef-amount font-semibold">−{formatInr(entry.taxWithheldAmount, { currency: entry.currency })}</dd></div>
                    {entry.adjustmentAmount !== 0 ? <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">{text.adjustment}</dt><dd className="chef-amount font-semibold">{formatInr(entry.adjustmentAmount, { currency: entry.currency })}</dd></div> : null}
                    <div className="flex justify-between gap-3 border-t border-[#E3E6EA] pt-2"><dt className="font-semibold">{text.yourEarning}</dt><dd className="chef-amount font-bold">{formatInr(entry.netPayable, { currency: entry.currency })}</dd></div>
                    {/* The reason is the finance service's own note. */}
                    {entry.reason ? <p className="pt-1 text-[0.8125rem] leading-5 text-[#6B6B6B]">{entry.reason}</p> : null}
                    <p className="text-[0.8125rem] text-[#6B6B6B]">{format(text.reference, { reference: entry.allocationReference, updated: dateTime(entry.updatedAt) })}</p>
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        )}
        {error && entries.length > 0 ? <div className="p-4 md:p-5"><ChefNotice icon={AlertTriangle} tone="danger" role="alert">{error}</ChefNotice></div> : null}
        {lastUpdatedAt && !loading ? <p className="border-t border-[#E3E6EA] px-4 py-3 text-[0.8125rem] text-[#6B6B6B] md:px-5">{format(text.updated, { time: lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase() })}</p> : null}
      </ChefSection>
    </div>
  );
}

const STATUS_TONE: Record<ChefEarningStatus, ChefTone> = {
  DRAFT: "muted",
  APPROVED: "active",
  SETTLEMENT_PENDING: "warning",
  SETTLED: "success",
  REVERSED: "danger",
};

export default ChefEarningsLedger;
