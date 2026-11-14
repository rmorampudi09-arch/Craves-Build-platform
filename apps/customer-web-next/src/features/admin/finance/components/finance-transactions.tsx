"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, X } from "lucide-react";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { FinanceTrail, targetOf, type Target } from "@/features/admin/finance/components/finance-trail";
import type { Period } from "@/features/admin/finance/components/finance-overview";
import { flowSign, KIND_LABEL, KINDS, movementPageSchema, movementsCsv, orderNumber, rupees, shortId, statusOf, statusesOf, type Kind, type Movement, type MovementPage } from "@/features/admin/finance/lib/insights-contract";
import { insightsError } from "@/features/admin/finance/lib/use-insights";

export type Filters = { kind: Kind | ""; status: string; party: string };
type Loaded = { key: string; items: Movement[]; next: string | null; summary: MovementPage["summary"] };

/** Every money movement in one list. A search looks at all dates; without one the list follows the period above. */
export function FinanceTransactions({ period, search, filters, names, onFilters, onClearSearch }: {
  period: Period; search: string; filters: Filters; names: (chefId: string | null) => string;
  onFilters: (filters: Filters) => void; onClearSearch: () => void;
}) {
  const key = JSON.stringify([search || period, filters]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [state, setState] = useState({ key: "", busy: false, error: "" });
  const [target, setTarget] = useState<Target | null>(null);
  const request = useRef(0);
  const who = (row: Movement) => row.partyName ?? (row.partyType === "CHEF" ? names(row.partyId) : row.partyId ? `${row.partyType === "RIDER" ? "Rider" : "Customer"} ${shortId(row.partyId)}` : "Not recorded");

  async function load(cursor?: string) {
    const mine = ++request.current;
    setState({ key, busy: true, error: "" });
    const query = new URLSearchParams({ view: "transactions", limit: "50" });
    if (search) query.set("search", search); else { query.set("from", period.from); query.set("to", period.to); }
    if (filters.kind) query.set("kind", filters.kind);
    if (filters.status) query.set("status", filters.status);
    if (filters.party) query.set("party", filters.party);
    if (cursor) query.set("cursor", cursor);
    try {
      const response = await adminFetch(`/api/admin/finance/insights?${query}`);
      if (!response.ok) throw new Error(insightsError(response.status));
      const page = movementPageSchema.safeParse(await response.json().catch(() => null));
      if (!page.success) throw new Error("The list couldn't be checked, so it isn't shown. Try again.");
      if (mine !== request.current) return;
      setLoaded(previous => cursor && previous?.key === key
        ? { ...previous, items: [...previous.items, ...page.data.items], next: page.data.nextCursor }
        : { key, items: page.data.items, next: page.data.nextCursor, summary: page.data.summary });
      setState({ key, busy: false, error: "" });
      // One exact match for a pasted reference: show its trail straight away.
      if (!cursor && search && page.data.items.length === 1) setTarget(targetOf(page.data.items[0]));
    } catch (error) {
      if (mine === request.current) setState({ key, busy: false, error: error instanceof Error && error.name !== "TimeoutError" ? error.message : insightsError(503) });
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is every input of the first page
  useEffect(() => { void load(); }, [key]);

  const rows = loaded?.items ?? [];
  const stale = state.busy || loaded?.key !== key;
  const counts = new Map(loaded?.summary.map(item => [item.kind, item.count]));
  const total = loaded?.summary.reduce((sum, item) => sum + item.count, 0) ?? 0;
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([movementsCsv(rows, who)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `craves-finance-${search ? "search" : `${period.from}-to-${period.to}`}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div style={{ display: "grid", gap: 16 }}>
    <div className="fn-filters">
      <div className="fn-chips" role="group" aria-label="Type of movement">
        <button type="button" className="fn-chip" aria-pressed={filters.kind === ""} onClick={() => onFilters({ ...filters, kind: "", status: "" })}>All {filters.kind === "" && loaded && <i>{total.toLocaleString("en-IN")}</i>}</button>
        {KINDS.map(kind => <button key={kind} type="button" className="fn-chip" aria-pressed={filters.kind === kind} onClick={() => onFilters({ ...filters, kind, status: "" })}>
          {KIND_LABEL[kind]}s {(filters.kind === "" || filters.kind === kind) && counts.has(kind) && <i>{counts.get(kind)!.toLocaleString("en-IN")}</i>}</button>)}
      </div>
      <label className="fn-field">Status<select value={filters.status} disabled={!filters.kind} onChange={event => onFilters({ ...filters, status: event.target.value })}>
        <option value="">{filters.kind ? "Any status" : "Pick a type first"}</option>
        {filters.kind && statusesOf(filters.kind).map(status => <option key={status} value={status}>{statusOf(filters.kind as Kind, status).label}</option>)}</select></label>
      <button type="button" className="cr-button" disabled={rows.length === 0} onClick={exportCsv}><Download size={15} aria-hidden="true" />Download these rows</button>
    </div>
    {search && <div className="fn-alert" role="status"><span>Showing everything that matches <strong>{search}</strong>, on any date.</span>
      <button type="button" className="cr-button" onClick={onClearSearch}><X size={15} aria-hidden="true" />Clear the search</button></div>}
    {filters.party && <div className="fn-alert" role="status"><span>Showing only <strong>{names(filters.party)}</strong>.</span>
      <button type="button" className="cr-button" onClick={() => onFilters({ ...filters, party: "" })}><X size={15} aria-hidden="true" />Show everyone</button></div>}
    {state.error && <div className="fn-alert" role="alert" data-tone="danger"><AlertTriangle size={18} aria-hidden="true" /><span>{state.error}</span>
      <button type="button" className="cr-button" onClick={() => void load()}>Try again</button></div>}
    <div className="fn-split" data-open={target ? "true" : undefined}>
      <section className="fn-card fn-list" aria-busy={stale}>
        {!loaded && !state.error && <div className="fn-skeleton" role="status" aria-label="Loading transactions">{Array.from({ length: 9 }, (_, index) => <span key={index} />)}</div>}
        {loaded && rows.length === 0 && !state.busy && <div className="fn-empty"><strong>{search ? "Nothing matches that reference" : "No money moved in this period"}</strong>
          <p className="fn-note">{search ? "Check it and try again. Order numbers, payment IDs, refund IDs, bank references (UTR) and rider names can be searched."
            : "Customer payments, refunds, chef earnings and payouts are listed here as they happen. Choose a longer period, or another type."}</p></div>}
        {rows.length > 0 && <div className={stale ? "fn-stale" : undefined}>
          <table className="fn-table"><caption className="cr-sr-only">Money movements, newest first. Choose a row to see its money trail.</caption>
            <thead><tr><th scope="col">What and when</th><th scope="col">Who</th><th scope="col" data-extra="true">Reference</th><th scope="col">Status</th><th scope="col" className="fn-amount">Amount</th></tr></thead>
            <tbody>{rows.map(row => {
              const status = statusOf(row.kind, row.status), open = targetOf(row), sign = flowSign(row);
              const selected = target !== null && (target.type === "row" ? target.row.id === row.id : target.type === "payout" ? target.id === row.id
                : row.checkoutId === target.checkoutId && row.kind !== "CHEF_PAYOUT" && row.kind !== "RIDER_PAYOUT");
              return <tr key={`${row.kind}-${row.id}`} data-selected={selected ? "true" : undefined} onClick={() => setTarget(open)}>
                <td data-wide="true"><button type="button" className="fn-rowbtn" aria-pressed={selected} aria-label={`${KIND_LABEL[row.kind]}, ${status.label}, ${rupees(row.amount)}, ${who(row)}. Show the money trail.`}>
                  <strong>{KIND_LABEL[row.kind]}</strong><small>{formatAdminTimestamp(row.at)}</small></button></td>
                <td>{who(row)}</td>
                <td className="fn-ref" data-extra="true">{row.reference ?? row.providerReference ?? (row.chefOrderId ? `Order ${orderNumber(row.chefOrderId)}` : "")}
                  {row.reference && row.providerReference && <small>{row.providerReference}</small>}</td>
                <td><span className="fn-status" data-tone={status.tone}>{status.label}</span></td>
                <td className="fn-amount fn-num" data-moved={sign || row.kind === "CHEF_EARNING" ? undefined : "false"}>{rupees(row.amount, sign)}</td>
              </tr>;
            })}</tbody></table>
          <div className="fn-more"><span className="fn-small">{rows.length.toLocaleString("en-IN")} of {Math.max(total, rows.length).toLocaleString("en-IN")} shown. A plus is money in and a minus is money out. An amount with no sign has not moved: chef earnings are owed, and a failed or unfinished row moved nothing.</span>
            {loaded?.next && <button type="button" className="cr-button" disabled={state.busy} onClick={() => void load(loaded.next!)}>{state.busy ? "Loading…" : "Show more"}</button>}</div>
        </div>}
      </section>
      {target && <FinanceTrail target={target} names={names} onOpen={setTarget} onClose={() => setTarget(null)} />}
    </div>
  </div>;
}
