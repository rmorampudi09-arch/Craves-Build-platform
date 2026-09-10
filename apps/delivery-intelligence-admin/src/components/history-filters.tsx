"use client";

import { useState, type FormEvent } from "react";
import { DEFAULT_FILTERS, historyQuery, type HistoryFilters } from "@/lib/history-filters";

export function HistoryFilterBar({ filters, onApply, loading }: { filters: HistoryFilters; onApply: (filters: HistoryFilters) => void; loading: boolean }) {
  const [draft, setDraft] = useState<HistoryFilters>({ ...filters });
  const [error, setError] = useState("");
  function apply(event: FormEvent) {
    event.preventDefault();
    try { historyQuery(draft); setError(""); onApply({ ...draft }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Check your dates."); }
  }
  return <form className="history-filter-bar surface-card" onSubmit={apply} aria-label="Filter delivery history">
    <label>Date range<select value={draft.range} onChange={event => setDraft({ ...draft, range: event.target.value as HistoryFilters["range"] })}>
      <option value="all">All time</option><option value="24">Last 24 hours</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option><option value="custom">Custom dates</option>
    </select></label>
    {draft.range === "custom" && <>
      <label>From (IST)<input type="date" required value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
      <label>Through (IST)<input type="date" required value={draft.through} min={draft.from || undefined} onChange={event => setDraft({ ...draft, through: event.target.value })} /></label>
    </>}
    <label>Activity order<select value={draft.sort} onChange={event => setDraft({ ...draft, sort: event.target.value as HistoryFilters["sort"] })}>
      <option value="desc">Newest first</option><option value="asc">Oldest first</option>
    </select></label>
    <label>Rows per page<select value={draft.limit} onChange={event => setDraft({ ...draft, limit: Number(event.target.value) })}>
      <option value="25">25</option><option value="50">50</option><option value="100">100</option>
    </select></label>
    <button type="submit" className="primary-button" disabled={loading}>Apply filters</button>
    <button type="button" className="icon-button" disabled={loading} onClick={() => { setDraft({ ...DEFAULT_FILTERS }); setError(""); onApply({ ...DEFAULT_FILTERS }); }}>Reset</button>
    {error && <p role="alert" className="history-filter-error">{error}</p>}
  </form>;
}
