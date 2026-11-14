"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { presetDates } from "@/features/admin/explorer/lib/admin-explorer";
import { FinanceOverview, type Jump, type Period } from "@/features/admin/finance/components/finance-overview";
import { FinancePayouts } from "@/features/admin/finance/components/finance-payouts";
import { FinanceSettings } from "@/features/admin/finance/components/finance-settings";
import { FinanceTransactions, type Filters } from "@/features/admin/finance/components/finance-transactions";
import { chefNames, initialView, shortId, type Tab } from "@/features/admin/finance/lib/insights-contract";
import "@/features/admin/styles/admin-finance.css";

const PRESETS = [[1, "Today"], [7, "7 days"], [30, "30 days"], [90, "90 days"]] as const;
const NO_FILTERS: Filters = { kind: "", status: "", party: "" };
const lastDays = (days: number): Period => { const range = presetDates(days); return { from: range.fromDate, to: range.toDate }; };
const DAY_MS = 86_400_000;

/**
 * Finance in four parts, chosen by the Finance tabs in the admin menu (?tab=). The period scopes Overview and Transactions;
 * Payouts always shows today's position. A jump between parts (a figure to its rows) moves the tab and the URL together.
 */
export function FinanceWorkspace({ initial, taxProfiles }: { initial: { tab: Tab; from: string; to: string; search: string }; taxProfiles: ReactNode }) {
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [period, setPeriod] = useState<Period>(() => initial.from ? { from: initial.from, to: initial.to } : lastDays(30));
  const [draft, setDraft] = useState(period);
  const [search, setSearch] = useState(initial.search);
  const [find, setFind] = useState(initial.search);
  const [findError, setFindError] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [chefs, setChefs] = useState<ReadonlyMap<string, string>>(new Map());
  // The Finance tabs in the menu are links to ?tab=. Follow the address whenever it changes, including back to the tab
  // that was open before a search (the server's `initial` is the same then, so it can't be the trigger).
  const params = useSearchParams();
  const wanted = params ? initialView(Object.fromEntries(params.entries())) : initial;
  useEffect(() => { setTab(wanted.tab); setSearch(wanted.search); setFind(wanted.search); }, [wanted.tab, wanted.search]);

  useEffect(() => {
    let active = true;
    // Names for the chef IDs finance records carry. Without them the screens still work and show short IDs.
    adminFetch("/api/admin/subscription-plans/chefs").then(async response => {
      const rows: unknown = response.ok ? await response.json() : [];
      if (active) setChefs(chefNames(rows));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const query = new URLSearchParams();
    if (tab !== "overview") query.set("tab", tab);
    if (search) query.set("q", search); else if (tab === "overview" || tab === "transactions") { query.set("from", period.from); query.set("to", period.to); }
    window.history.replaceState(null, "", `/admin/finance${query.size ? `?${query}` : ""}`);
  }, [tab, period, search]);

  const names = useCallback((chefId: string | null) => chefId ? chefs.get(chefId) ?? `Chef ${shortId(chefId)}` : "Not recorded", [chefs]);
  function choose(next: Period) { setPeriod(next); setDraft(next); }
  function jump(to: Jump) {
    if (to.days) choose(lastDays(to.days)); else if (to.from && to.to) choose({ from: to.from, to: to.to });
    setFilters({ kind: to.kind ?? "", status: to.status ?? "", party: to.party ?? "" });
    setSearch(""); setFind(""); setFindError(""); setTab("transactions");
  }
  function editDate(next: Period) {
    setDraft(next);
    const span = (Date.parse(next.to) - Date.parse(next.from)) / DAY_MS;
    if (next.from && next.to && span >= 0 && span <= 366) setPeriod(next);
  }
  function submitFind(event: FormEvent) {
    event.preventDefault();
    const value = find.trim().replace(/^#/, "");
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(value)) { setFindError("Type an order number like #1A2B3C4D, or paste a whole ID or bank reference. It needs at least 3 letters or digits, with no spaces."); return; }
    setFindError(""); setFind(value); setFilters(NO_FILTERS); setSearch(value); setTab("transactions");
  }
  const dated = tab === "overview" || (tab === "transactions" && !search);
  const badDates = draft.from > draft.to || (Date.parse(draft.to) - Date.parse(draft.from)) / DAY_MS > 366;

  return <div className="fn">
    {dated && <header className="fn-head">
      <p className="fn-note">Period for Overview and Transactions</p>
      <div className="fn-period">
        <div className="fn-seg" role="group" aria-label="Period">{PRESETS.map(([days, label]) => {
          const preset = lastDays(days);
          return <button key={days} type="button" aria-pressed={preset.from === period.from && preset.to === period.to} onClick={() => choose(preset)}>{label}</button>;
        })}</div>
        <label className="fn-field">From<input type="date" value={draft.from} max={draft.to} onChange={event => editDate({ ...draft, from: event.target.value })} /></label>
        <label className="fn-field">To<input type="date" value={draft.to} min={draft.from} onChange={event => editDate({ ...draft, to: event.target.value })} /></label>
      </div>
    </header>}
    {dated && badDates && <p className="fn-small" role="alert">Choose a From date on or before the To date, at most a year apart. Still showing {period.from} to {period.to}.</p>}
    <div>
      <form className="fn-find" role="search" onSubmit={submitFind}><Search size={18} aria-hidden="true" />
        <input type="search" value={find} maxLength={80} aria-label="Find an order, payment or bank reference" aria-describedby={findError ? "fn-find-error" : undefined}
          placeholder="Find by order number, payment ID, bank reference (UTR) or rider name" onChange={event => setFind(event.target.value)} />
        <button className="cr-button cr-primary">Find</button></form>
      {findError && <p id="fn-find-error" className="fn-small" role="alert" style={{ marginTop: 6 }}>{findError}</p>}
    </div>
    <div id="fn-panel">
      {tab === "overview" && <FinanceOverview period={period} onJump={jump} onPayouts={() => setTab("payouts")} />}
      {tab === "transactions" && <FinanceTransactions period={period} search={search} filters={filters} names={names} onFilters={setFilters}
        onClearSearch={() => { setSearch(""); setFind(""); }} />}
      {tab === "payouts" && <FinancePayouts names={names} onJump={jump} />}
      {tab === "settings" && <FinanceSettings taxProfiles={taxProfiles} />}
    </div>
  </div>;
}
