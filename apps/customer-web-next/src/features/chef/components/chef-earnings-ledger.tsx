"use client";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeIndianRupee,
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

type LedgerView = "ALL" | ChefEarningStatus;

export function ChefEarningsLedger() {
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
      if (!response.ok) throw chefApiError(response, raw, "We couldn’t load your earnings. Try again.");
      const parsed = parseChefEarnings(raw);
      if (!parsed) throw new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_CHEF_EARNINGS_RESPONSE", response.status);
      setEntries(
        [...parsed].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
      );
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(
        chefErrorText(caught, "We couldn’t load your earnings. Try again."),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
    { value: "ALL", label: "All" },
    { value: "SETTLEMENT_PENDING", label: STATUS_LABEL.SETTLEMENT_PENDING },
    { value: "SETTLED", label: STATUS_LABEL.SETTLED },
    { value: "APPROVED", label: STATUS_LABEL.APPROVED },
    { value: "DRAFT", label: STATUS_LABEL.DRAFT },
    { value: "REVERSED", label: STATUS_LABEL.REVERSED },
  ];

  return (
    <div className="chef-stack">
      <ChefSection flush>
        <div className="chef-stats is-three">
          <div className="chef-stat">
            <p className="chef-stat-label">You earned</p>
            <p className="chef-stat-value">{loading ? "—" : formatInr(approvedPayable, { currency })}</p>
          </div>
          <div className="chef-stat">
            <p className="chef-stat-label">Coming to your bank</p>
            <p className="chef-stat-value">{loading ? "—" : formatInr(pendingPayable, { currency })}</p>
          </div>
          <div className="chef-stat">
            <p className="chef-stat-label">Paid to your bank</p>
            <p className="chef-stat-value">{loading ? "—" : formatInr(settledPayable, { currency })}</p>
          </div>
        </div>
        <p className="border-t border-[#E3E6EA] px-4 py-3 text-[0.8125rem] leading-5 text-[#6B6B6B] md:px-5">
          These add up the orders below. Refunds and other changes are counted in Balance &amp; payouts, where you take out your money.
        </p>
      </ChefSection>

      <ChefSection
        title="Money from each order"
        flush
        labelledBy="chef-earnings-list"
        action={
          <button type="button" disabled={refreshing || loading} onClick={() => void load(true)} className="chef-btn is-small" aria-busy={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        }
      >
        <div className="chef-chips px-4 md:px-5" role="group" aria-label="Filter earnings">
          {filters.map((filter) => (
            <button key={filter.value} type="button" onClick={() => setView(filter.value)} aria-pressed={view === filter.value} className="chef-chip min-h-[40px]">
              {filter.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-2 p-4 md:p-5" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => <ChefSkeleton key={index} className="h-14" />)}
          </div>
        ) : error && entries.length === 0 ? (
          <ChefEmpty
            icon={AlertTriangle}
            title="Earnings couldn’t load"
            text={error}
            action={<button type="button" onClick={() => void load()} className="chef-btn is-primary">Try again</button>}
          />
        ) : entries.length === 0 ? (
          <ChefEmpty
            icon={BadgeIndianRupee}
            title="No earnings yet"
            text="Money from an order shows here after the customer gets their food."
          />
        ) : visibleEntries.length === 0 ? (
          <ChefEmpty icon={BadgeIndianRupee} title="Nothing here" text="Tap All to see every order." />
        ) : (
          <ul className="chef-list mt-3 border-t border-[#E3E6EA]">
            {visibleEntries.map((entry) => (
              <li key={entry.id}>
                <details className="group">
                  <summary className="chef-row cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <span className="chef-row-main">
                      <span className="chef-row-title block">Order #{shortOrderNumber(entry.orderId)}{entry.orderSource === "SUBSCRIPTION" ? " · Meal plan" : ""}</span>
                      <span className="chef-row-meta flex flex-wrap items-center gap-2">
                        {dateTime(entry.createdAt)}
                        <ChefPill tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</ChefPill>
                      </span>
                    </span>
                    <span className={`chef-row-value chef-amount ${entry.status === "REVERSED" ? "text-[#6B6B6B] line-through" : ""}`}>{formatInr(entry.netPayable, { currency: entry.currency })}</span>
                    <ChevronDown className="chef-chevron h-5 w-5 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <dl className="grid gap-2 bg-[#F7F8FA] px-4 py-3 text-[0.875rem] md:px-5">
                    <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Order value</dt><dd className="chef-amount font-semibold">{formatInr(entry.grossAmount, { currency: entry.currency })}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Craves service fee</dt><dd className="chef-amount font-semibold">−{formatInr(entry.commissionAmount, { currency: entry.currency })}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Tax withheld</dt><dd className="chef-amount font-semibold">−{formatInr(entry.taxWithheldAmount, { currency: entry.currency })}</dd></div>
                    {entry.adjustmentAmount !== 0 ? <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Adjustment</dt><dd className="chef-amount font-semibold">{formatInr(entry.adjustmentAmount, { currency: entry.currency })}</dd></div> : null}
                    <div className="flex justify-between gap-3 border-t border-[#E3E6EA] pt-2"><dt className="font-semibold">Your earning</dt><dd className="chef-amount font-bold">{formatInr(entry.netPayable, { currency: entry.currency })}</dd></div>
                    {entry.reason ? <p className="pt-1 text-[0.8125rem] leading-5 text-[#6B6B6B]">{entry.reason}</p> : null}
                    <p className="text-[0.8125rem] text-[#6B6B6B]">Reference {entry.allocationReference} · Updated {dateTime(entry.updatedAt)}</p>
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        )}
        {error && entries.length > 0 ? <div className="p-4 md:p-5"><ChefNotice icon={AlertTriangle} tone="danger" role="alert">{error}</ChefNotice></div> : null}
        {lastUpdatedAt && !loading ? <p className="border-t border-[#E3E6EA] px-4 py-3 text-[0.8125rem] text-[#6B6B6B] md:px-5">Updated {lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase()}</p> : null}
      </ChefSection>
    </div>
  );
}

const STATUS_LABEL: Record<ChefEarningStatus, string> = {
  DRAFT: "Being added",
  APPROVED: "Confirmed",
  SETTLEMENT_PENDING: "Coming to bank",
  SETTLED: "Paid to bank",
  REVERSED: "Taken back",
};
const STATUS_TONE: Record<ChefEarningStatus, ChefTone> = {
  DRAFT: "muted",
  APPROVED: "active",
  SETTLEMENT_PENDING: "warning",
  SETTLED: "success",
  REVERSED: "danger",
};

export default ChefEarningsLedger;
