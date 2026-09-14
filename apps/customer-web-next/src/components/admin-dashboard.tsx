"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, Copy, Download, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { adminFetch } from "@/lib/admin-renewal";
import { parseAdminDashboardSummary, type AdminDashboardSummary } from "@/lib/admin-dashboard-contract";
import { adminMetricCsv, formatAdminTimestamp, readableAdminStatus } from "@/lib/admin-navigation";
import { AdminModuleDirectory } from "@/components/admin-module-directory";

type SummaryMetrics = AdminDashboardSummary["metrics"];
const metricCards: ReadonlyArray<{ key: keyof SummaryMetrics; label: string; note: string; tone?: string }> = [
  { key: "ordersCreated24h", label: "Orders created", note: "Last 24 hours" },
  { key: "chefAcceptancePending", label: "Awaiting chef", note: "Current queue", tone: "warning" },
  { key: "preparing", label: "Preparing", note: "Current orders" },
  { key: "readyForPickup", label: "Ready for pickup", note: "Current orders", tone: "info" },
  { key: "outForDelivery", label: "Out for delivery", note: "Current orders", tone: "info" },
  { key: "delivered24h", label: "Delivered", note: "Updated in last 24 hours", tone: "success" },
  { key: "refundPending", label: "Refund pending", note: "Current queue", tone: "warning" },
  { key: "refundFailed", label: "Refund failed", note: "Needs investigation", tone: "danger" }
];

export function AdminDashboard() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(true);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"updated" | "status">("updated");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [feedback, setFeedback] = useState("");
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++generation.current;
    setRefreshing(true);
    setMessage("");
    try {
      const response = await adminFetch("/api/admin/dashboard/summary", { cache: "no-store", signal: controller.signal });
      if (current !== generation.current) return;
      if (response.status === 401 || response.status === 403) {
        setSummary(null);
        throw new Error("Administrator access must be verified. Sign in again or retry your connection.");
      }
      if (!response.ok) throw new Error("The operational summary is temporarily unavailable. Other modules may still be accessible below.");
      const parsed = parseAdminDashboardSummary(await response.json().catch(() => null));
      if (!parsed) throw new Error("The summary response could not be verified. No replacement values have been invented.");
      if (current === generation.current) { setSummary(parsed); setMessage(""); }
    } catch (error) {
      if (current === generation.current && !controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to load the operational summary.");
    } finally {
      if (current === generation.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; request.current?.abort(); };
  }, [load]);

  async function copyReference(reference: string) {
    try { await navigator.clipboard.writeText(reference); setFeedback("Order reference copied."); }
    catch { setFeedback("Clipboard access is unavailable. Select and copy the full reference in the row details."); }
  }

  function exportMetrics() {
    if (!summary) return;
    try {
      const url = URL.createObjectURL(new Blob([adminMetricCsv(summary.metrics, summary.generatedAt)], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `craves-admin-metrics-${new Date(summary.generatedAt).toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback("Aggregate metrics exported. No customer or chef identifiers were included.");
    } catch { setFeedback("Export could not be prepared. Please refresh the summary and try again."); }
  }

  const filtered = (summary?.recentExceptions ?? []).filter(item => {
    const needle = filter.trim().toLowerCase();
    return (status === "all" || item.status === status) && `${item.orderId} ${item.kitchenName ?? ""}`.toLowerCase().includes(needle);
  }).sort((a, b) => sort === "status" ? a.status.localeCompare(b.status) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const maxTrend = Math.max(1, ...(summary?.orderTrend.map(point => point.count) ?? []));
  const maxStatus = Math.max(1, ...(summary?.statusCounts.map(item => item.count) ?? []));

  return <div className="cr-dashboard">
    <section className="cr-welcome">
      <div><p className="cr-eyebrow">The Craves control center</p><h1>A clear view.<br className="cr-mobile-break"/> The right next action.</h1><p>Keep every meal moving. Find a case, understand what happened, and open the right controlled workflow.</p></div>
      <div className="cr-actions"><Link href="/admin/search" className="cr-button cr-primary"><Search size={17} aria-hidden="true"/>Global search</Link><button className="cr-button" type="button" onClick={() => void load()} disabled={refreshing}><RefreshCw size={17} aria-hidden="true" className={refreshing ? "cr-spin" : ""}/>{refreshing ? "Refreshing…" : "Refresh snapshot"}</button></div>
    </section>

    <div className="cr-snapshot-line"><span className="cr-badge" data-tone={message ? "warning" : undefined}><Clock3 size={14} aria-hidden="true"/>{summary ? `Snapshot: ${formatAdminTimestamp(summary.generatedAt)}` : refreshing ? "Loading operational summary" : "Summary unavailable"}</span><span>Snapshot data · Refresh on demand</span></div>
    {message && <div className="cr-alert" role="alert"><strong>{message}</strong>{summary && <p>Showing the last successfully loaded snapshot above, not a live refresh.</p>}</div>}

    {!summary && <section className="cr-panel cr-empty" aria-busy={refreshing}><h2>{refreshing ? "Loading your operational overview" : "The overview could not be loaded"}</h2><p>{refreshing ? "Retrieving the existing backend summary. No sample numbers are shown." : "Use Refresh snapshot to retry. Your module directory remains available below."}</p>{refreshing && <div className="cr-skeleton" aria-hidden="true"/>}</section>}

    {summary && <>
      <section aria-labelledby="cr-workload-title"><div className="cr-section-heading"><div><p className="cr-eyebrow">Operational workload</p><h2 id="cr-workload-title">What needs your attention</h2></div><button type="button" onClick={exportMetrics} className="cr-button"><Download size={16} aria-hidden="true"/>Export metrics</button></div>
        <div className="cr-metric-grid">{metricCards.map(card => <article className="cr-metric" key={card.key} data-tone={card.tone}><span className="cr-metric-label">{card.label}</span><strong>{summary.metrics[card.key].toLocaleString("en-IN")}</strong><span className="cr-muted">{card.note}</span></article>)}</div>
      </section>

      <section className="cr-panel" aria-labelledby="cr-attention-title">
        <div className="cr-section-heading"><div><p className="cr-eyebrow">Recent exceptions</p><h2 id="cr-attention-title">Review. Investigate. Resolve.</h2><p className="cr-muted">This is the recent-exception summary, not the complete order history. Open investigations for the full case.</p></div><Link href="/admin/operations" className="cr-button">Open investigations<ArrowRight size={16} aria-hidden="true"/></Link></div>
        <div className="cr-filter-row"><label className="cr-search-field"><Search size={16} aria-hidden="true"/><span className="cr-sr-only">Filter recent exceptions by order reference or kitchen</span><input type="search" placeholder="Filter this snapshot by order or kitchen…" maxLength={160} value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}/></label>
          <label className="cr-select-label">Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option>{[...new Set(summary.recentExceptions.map(item => item.status))].map(value => <option value={value} key={value}>{readableAdminStatus(value)}</option>)}</select></label>
          <label className="cr-select-label">Sort<select value={sort} onChange={event => { setSort(event.target.value === "status" ? "status" : "updated"); setPage(1); }}><option value="updated">Newest first</option><option value="status">Status</option></select></label>
          <button className="cr-button" onClick={() => { setFilter(""); setStatus("all"); setSort("updated"); setPage(1); }}>Reset filters</button>
        </div>
        {rows.length === 0 ? <div className="cr-empty"><CheckCircle2 size={26} aria-hidden="true"/><strong>{summary.recentExceptions.length === 0 ? "No recent exceptions in this snapshot" : "No exceptions match these filters"}</strong><p>{summary.recentExceptions.length === 0 ? "This does not certify that every service is healthy." : "Clear the filters to see the returned snapshot."}</p></div> : <div className="cr-table-scroll" role="region" aria-label="Recent exception records" tabIndex={0}><table className="cr-table"><caption className="cr-sr-only">Recent exceptions from {formatAdminTimestamp(summary.generatedAt)}</caption><thead><tr><th scope="col">Order reference</th><th scope="col">Kitchen</th><th scope="col">Status</th><th scope="col">Last updated · IST</th><th scope="col">Details</th></tr></thead><tbody>{rows.map(item => <tr key={item.orderId}><td><code>{item.orderId.slice(0, 8).toUpperCase()}</code></td><td>{item.kitchenName || "Kitchen name unavailable"}</td><td><span className="cr-status" data-tone={item.status === "REFUND_FAILED" ? "danger" : "warning"}>{readableAdminStatus(item.status)}</span></td><td>{formatAdminTimestamp(item.updatedAt)}</td><td><details className="cr-record-details"><summary>View reference</summary><div><code>{item.orderId}</code><button type="button" className="cr-button" onClick={() => void copyReference(item.orderId)}><Copy size={14} aria-hidden="true"/>Copy reference</button><p className="cr-footnote">Paste this into Orders & investigations. The existing audit-reason requirement still applies.</p></div></details></td></tr>)}</tbody></table></div>}
        <div className="cr-pagination"><span>{filtered.length} matching / {summary.recentExceptions.length} returned records</span><label className="cr-select-label">Rows<select value={pageSize} onChange={event => { setPageSize(event.target.value === "10" ? 10 : 5); setPage(1); }}><option value="5">5</option><option value="10">10</option></select></label><button className="cr-button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span aria-live="polite">Page {currentPage} of {pageCount}</span><button className="cr-button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>
      </section>

      <div className="cr-chart-grid">
        <section className="cr-panel" aria-labelledby="cr-trend-title"><p className="cr-eyebrow">Reported period</p><h2 id="cr-trend-title">Order volume</h2><p className="cr-muted">All date buckets returned by the backend.</p>
          {summary.orderTrend.length === 0 ? <p className="cr-empty">No trend records were returned.</p> : <><div className="cr-chart-scroll"><div className="cr-bar-chart" style={{ minWidth: `${Math.max(280, summary.orderTrend.length * 38)}px` }} aria-hidden="true">{summary.orderTrend.map(point => <div className="cr-bar-column" key={point.date} title={`${point.date}: ${point.count} orders`}><strong>{point.count.toLocaleString("en-IN")}</strong><div className="cr-bar-track"><span style={{ height: `${100 * point.count / maxTrend}%` }}/></div><small>{point.date.slice(5)}</small></div>)}</div></div><details className="cr-chart-data"><summary>View exact chart data</summary><table className="cr-table"><caption className="cr-sr-only">Order volume by backend date bucket</caption><thead><tr><th scope="col">Date</th><th scope="col">Orders</th></tr></thead><tbody>{summary.orderTrend.map(point => <tr key={point.date}><td>{point.date}</td><td>{point.count.toLocaleString("en-IN")}</td></tr>)}</tbody></table></details></>}
        </section>
        <section className="cr-panel" aria-labelledby="cr-flow-title"><p className="cr-eyebrow">Current flow</p><h2 id="cr-flow-title">Operational stages</h2><p className="cr-muted">Backend-reported counts by current status.</p><div className="cr-stage-list">{summary.statusCounts.map(item => <div key={item.status}><div><span>{readableAdminStatus(item.status)}</span><strong>{item.count.toLocaleString("en-IN")}</strong></div><div className="cr-stage-track" aria-hidden="true"><span style={{ width: `${100 * item.count / maxStatus}%` }}/></div></div>)}</div>{summary.statusCounts.length === 0 && <p className="cr-empty">No stage records were returned.</p>}</section>
      </div>
    </>}
    <p className="cr-feedback" role="status" aria-live="polite">{feedback}</p>
    <AdminModuleDirectory compact/>
    <section className="cr-safety-note"><ShieldCheck size={24} aria-hidden="true"/><div><strong>Easy to operate. Controlled where it matters.</strong><p>Search is audited. Sensitive actions stay in their owning modules. Pricing, payout, account and recovery rules are not bypassed by this dashboard.</p></div></section>
  </div>;
}
