"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseAdminPage } from "@/features/account-deletion/domain/deletion-contract";
import { formatDeletionDate } from "@/features/account-deletion/domain/deletion-model";
import type { AdminDeletionSummary, DeletionStatus } from "@/features/account-deletion/domain/deletion-types";
import { codeOf, deletionError, FILTERS, SCOPE_LABELS, shortId, STATUS_LABELS } from "@/features/admin/account-deletions/lib/admin-deletion-client";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";

type Filter = DeletionStatus | "";
const BASE = "/api/admin/account-deletions";

/** Deletion requests as the server lists them (oldest first), one status at a time. */
export function DeletionRequestList() {
  const [filter, setFilter] = useState<Filter>("PENDING_REVIEW");
  const [items, setItems] = useState<AdminDeletionSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  // Only the newest question may change the page: a slow answer for a filter already left is dropped.
  const latest = useRef(0);

  const load = useCallback(async (status: Filter, cursor: string | null) => {
    const ticket = ++latest.current;
    setError("");
    if (cursor) setLoadingMore(true);
    else { setLoading(true); setItems([]); setNextCursor(null); }
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (cursor) query.set("cursor", cursor);
    try {
      const search = query.toString();
      const response = await adminFetch(search ? `${BASE}?${search}` : BASE, { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (ticket !== latest.current) return;
      const page = response.ok ? parseAdminPage(body) : null;
      if (!page) return setError(deletionError(response.ok ? "INVALID_DELETION_RESPONSE" : codeOf(body), "view"));
      setItems(current => cursor ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
    } catch {
      if (ticket === latest.current) setError(deletionError(undefined, "view"));
    } finally {
      if (ticket === latest.current) { setLoading(false); setLoadingMore(false); }
    }
  }, []);

  useEffect(() => {
    void load(filter, null);
    const tickets = latest;
    return () => { tickets.current++; };
  }, [filter, load]);

  const label = filter ? STATUS_LABELS[filter].toLowerCase() : "";
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center gap-2">
      <div className="cr-tabs !mb-0" role="group" aria-label="Request status">
        {FILTERS.map(value => <button key={value || "ALL"} type="button" className="cr-tab" aria-pressed={value === filter} onClick={() => setFilter(value)}>
          {value ? STATUS_LABELS[value] : "All"}</button>)}
      </div>
      <button type="button" className="cr-button ml-auto" disabled={loading || loadingMore} onClick={() => { void load(filter, null); }}>
        <RefreshCw size={16} aria-hidden="true" />Refresh</button>
    </div>
    {error ? <p role="alert" className="cr-error-text">{error}</p> : null}
    {loading ? <p role="status" className="cr-muted">Loading requests...</p>
      : items.length === 0 ? (error ? null : <p className="cr-muted">{filter ? `No requests are ${label}.` : "No deletion requests yet."}</p>)
      : <div className="cr-panel !p-0">
        <div className="cr-table-scroll"><table className="cr-table">
          <caption className="sr-only">Deletion requests, oldest first</caption>
          <thead><tr>{["Requested", "Scope", "Status", "Via", "Due", "Request"].map(name => <th key={name} scope="col">{name}</th>)}</tr></thead>
          <tbody>{items.map(item => <tr key={item.requestId}>
            <td>{formatAdminTimestamp(item.requestedAt)}</td>
            <td>{SCOPE_LABELS[item.scope]}</td>
            <td>{STATUS_LABELS[item.status]}</td>
            <td>{item.via === "APP" ? "App" : "Web"}</td>
            <td>{(item.dueAt && formatDeletionDate(item.dueAt, "long", "Asia/Kolkata")) || "—"}</td>
            <td><Link href={`/admin/account-deletions/${encodeURIComponent(item.requestId)}`} prefetch={false} className="font-semibold underline"><code>{shortId(item.requestId)}</code></Link></td>
          </tr>)}</tbody>
        </table></div>
      </div>}
    {!loading && nextCursor ? <button type="button" className="cr-button" disabled={loadingMore} onClick={() => { void load(filter, nextCursor); }}>
      {loadingMore ? "Loading..." : "Load more"}</button> : null}
  </section>;
}
