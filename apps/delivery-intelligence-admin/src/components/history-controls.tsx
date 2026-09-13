"use client";

import { useState, type FormEvent } from "react";
import { DEFAULT_HISTORY_FILTERS, historyQuery, type HistoryFilters } from "@/lib/delivery-history";

export function HistoryControls({ loading, onApply }: {
  loading: boolean;
  onApply: (filters: HistoryFilters) => void;
}) {
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS);
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      historyQuery({ filters, activityOffset: 0, attentionOffset: 0 });
      setError(null);
      onApply(filters);
    } catch {
      setError("Choose valid dates, with the start on or before the end. Dates include the full day in IST.");
    }
  }
  return <form className="history-controls surface-card" aria-label="Delivery history filters" onSubmit={submit}>
    <label>Time range<select value={filters.range} onChange={e => setFilters({ ...filters, range: e.target.value as HistoryFilters["range"] })}>
      <option value="all">All history</option><option value="24">Last 24 hours</option>
      <option value="168">Last 7 days</option><option value="720">Last 30 days</option><option value="custom">Custom dates (IST)</option>
    </select></label>
    {filters.range === "custom" && <>
      <label>From date (IST)<input type="date" required value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label>
      <label>To date (IST)<input type="date" required min={filters.from || undefined} value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label>
    </>}
    <label>Sort order<select value={filters.sort} onChange={e => setFilters({ ...filters, sort: e.target.value as HistoryFilters["sort"] })}>
      <option value="desc">Newest first</option><option value="asc">Oldest first</option>
    </select></label>
    <label>Rows per page<select value={filters.limit} onChange={e => setFilters({ ...filters, limit: Number(e.target.value) })}>
      {[5, 25, 50, 100].map(limit => <option key={limit} value={limit}>{limit}</option>)}
    </select></label>
    <button type="submit" className="primary-button" disabled={loading}>Apply filters</button>
    {error && <p className="history-filter-error" role="alert">{error}</p>}
  </form>;
}

export function HistoryPagination({ name, offset, count, hasMore, loading, onPage }: {
  name: string; offset: number; count: number; hasMore: boolean; loading: boolean;
  onPage: (direction: -1 | 1) => void;
}) {
  return <nav className="history-pagination" aria-label={`${name} pages`}>
    <button type="button" className="icon-button" aria-label={`Previous ${name} page`} disabled={loading || offset === 0} onClick={() => onPage(-1)}>Previous</button>
    <span role="status">{count ? `${offset + 1}–${offset + count}` : "No rows"}{hasMore ? " · more available" : " · end of results"}</span>
    <button type="button" className="icon-button" aria-label={`Next ${name} page`} disabled={loading || !hasMore} onClick={() => onPage(1)}>Next</button>
  </nav>;
}
