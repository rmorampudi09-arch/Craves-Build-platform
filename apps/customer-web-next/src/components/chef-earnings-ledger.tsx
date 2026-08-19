"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeIndianRupee,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import {
  parseChefEarnings,
  type ChefEarning,
} from "@/lib/chef-earnings-contract";

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function isThisWeek(value: string): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - distanceFromMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return date >= start && date < end;
}

function friendlyStatus(status: ChefEarning["status"]): string {
  if (status === "SETTLED") return "Paid";
  if (status === "SETTLEMENT_PENDING") return "Payment being prepared";
  if (status === "APPROVED") return "Approved";
  if (status === "REVERSED") return "Adjusted";
  return "Being checked";
}

export function ChefEarningsLedger() {
  const [entries, setEntries] = useState<ChefEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  // The browser never calculates commission. Every amount shown here comes
  // from the existing finance-owned earnings response.
  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chef/earnings", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          raw &&
          typeof raw === "object" &&
          "message" in raw &&
          typeof raw.message === "string"
            ? raw.message
            : "We couldn’t load what you’ve earned right now.";
        throw new Error(message);
      }
      const parsed = parseChefEarnings(raw);
      if (!parsed) throw new Error("We couldn’t read your latest earnings. Please refresh.");
      setEntries(
        [...parsed].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
      );
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t load what you’ve earned right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const counted = entries.filter(
      (entry) =>
        ["APPROVED", "SETTLEMENT_PENDING", "SETTLED"].includes(entry.status) &&
        isThisWeek(entry.createdAt),
    );
    const currency = counted[0]?.currency ?? entries[0]?.currency ?? "INR";
    return {
      amount: counted.reduce((sum, entry) => sum + entry.netPayable, 0),
      currency,
      hasRecordedEarnings: entries.length > 0,
    };
  }, [entries]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#F62E18]">What I’ve earned</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A]">This week</h1>
          <p className="mt-2 text-sm text-[#6B6B6B]">Only earnings recorded for your chef account are shown here.</p>
        </div>
        <button type="button" disabled={refreshing || loading} onClick={() => void load(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#1A1A1A] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />Refresh</button>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-3xl bg-[#F1F3F5]" aria-label="Loading earnings" />
      ) : error && entries.length === 0 ? (
        <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5]"><BadgeIndianRupee className="h-6 w-6 text-[#F62E18]" aria-hidden="true" /></span>
          <h2 className="mt-4 text-xl font-bold text-[#1A1A1A]">Earnings couldn’t load</h2>
          <p className="mt-2 text-sm text-[#6B6B6B]">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-5 min-h-12 rounded-full bg-[#F62E18] px-6 font-semibold text-white">Try again</button>
        </section>
      ) : (
        <>
          <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center md:p-10">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><BadgeIndianRupee className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
            {summary.amount > 0 ? (
              <>
                <p className="mt-5 text-sm text-[#6B6B6B]">Recorded for you this week</p>
                <p className="mt-1 text-4xl font-bold tracking-tight text-[#1A1A1A] md:text-5xl">{money(summary.amount, summary.currency)}</p>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#6B6B6B]">Payment progress for each earning appears below when you choose to see more.</p>
              </>
            ) : (
              <>
                <h2 className="mt-5 text-2xl font-bold text-[#1A1A1A]">Your earnings will appear here</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6B6B6B]">There isn’t a recorded earning for this week yet. You don’t need to calculate anything yourself.</p>
              </>
            )}
          </section>

          {summary.hasRecordedEarnings ? (
            <section className="rounded-3xl border border-[#E5E7EB] bg-white p-5 md:p-6">
              <button type="button" onClick={() => setShowAll((current) => !current)} aria-expanded={showAll} className="flex min-h-12 w-full items-center justify-between gap-4 rounded-2xl px-2 text-left font-semibold text-[#1A1A1A]">
                <span>{showAll ? "Hide older earnings" : "See all earnings"}</span>
                <ChevronDown className={`h-5 w-5 transition-transform ${showAll ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>

              {showAll ? (
                <div className="mt-4 space-y-3">
                  {entries.map((entry) => (
                    <article key={entry.id} className="rounded-2xl bg-[#F1F3F5] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div><span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6B6B6B]">{friendlyStatus(entry.status)}</span><p className="mt-3 font-semibold text-[#1A1A1A]">Order #{entry.orderId.slice(-8).toUpperCase()}</p><p className="mt-1 text-xs text-[#6B6B6B]">Recorded {new Date(entry.createdAt).toLocaleDateString("en-IN")}</p></div>
                        <div className="text-right"><p className="text-xs text-[#6B6B6B]">Your recorded amount</p><p className="mt-1 text-xl font-bold text-[#1A1A1A]">{money(entry.netPayable, entry.currency)}</p></div>
                      </div>
                      <details className="mt-4 border-t border-[#E5E7EB] pt-4"><summary className="cursor-pointer text-sm font-semibold text-[#1A1A1A]">How this amount was recorded</summary><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Food amount</dt><dd className="font-semibold text-[#1A1A1A]">{money(entry.grossAmount, entry.currency)}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Craves fee</dt><dd className="font-semibold text-[#1A1A1A]">-{money(entry.commissionAmount, entry.currency)}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Tax kept aside</dt><dd className="font-semibold text-[#1A1A1A]">-{money(entry.taxWithheldAmount, entry.currency)}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Other adjustment</dt><dd className="font-semibold text-[#1A1A1A]">{money(entry.adjustmentAmount, entry.currency)}</dd></div></dl>{entry.reason ? <p className="mt-3 text-xs leading-5 text-[#6B6B6B]">Note: {entry.reason}</p> : null}</details>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      {lastUpdatedAt ? <p className="text-xs text-[#6B6B6B]">Last refreshed {lastUpdatedAt.toLocaleTimeString("en-IN")}</p> : null}
      {error && entries.length > 0 ? <p role="alert" className="rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#F62E18]">{error}</p> : null}
    </div>
  );
}

export default ChefEarningsLedger;
